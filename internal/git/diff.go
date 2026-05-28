package git

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	gitdiff "github.com/go-git/go-git/v5/plumbing/format/diff"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// ChangeOp identifies the kind of change at the record level.
type ChangeOp string

const (
	OpAdded    ChangeOp = "added"
	OpModified ChangeOp = "modified"
	OpDeleted  ChangeOp = "deleted"
)

// RecordClass distinguishes primitives from bundles from indexes from anything else.
type RecordClass string

const (
	ClassPrimitive RecordClass = "primitive"
	ClassBundle    RecordClass = "bundle"
	ClassIndex     RecordClass = "index"
	ClassOther     RecordClass = "other"
)

// FileChange is the line-level summary the UI renders in the "Files changed" card.
type FileChange struct {
	Op      string `json:"op"`     // "+", "M", "-"
	Path    string `json:"path"`   // posix-style relative path
	Added   int    `json:"added"`  // lines added
	Removed int    `json:"removed"`
}

// SemanticChange is the recommender's per-record input.
type SemanticChange struct {
	Op     ChangeOp       `json:"op"`
	Class  RecordClass    `json:"class"`
	Path   string         `json:"path"`
	Slug   string         `json:"slug,omitempty"`
	Kind   string         `json:"kind,omitempty"`
	Before map[string]any `json:"before,omitempty"`
	After  map[string]any `json:"after,omitempty"`

	// Sub-flags computed for modified records.
	BodyChanged          bool             `json:"body_changed,omitempty"`
	RelationshipsChanged bool             `json:"relationships_changed,omitempty"`
	NewRelationships     []map[string]any `json:"new_relationships,omitempty"`
	DroppedRelationships []map[string]any `json:"dropped_relationships,omitempty"`
	LicenseChanged       bool             `json:"license_changed,omitempty"`
	HashChanged          bool             `json:"hash_changed,omitempty"`
	NamesChanged         bool             `json:"names_changed,omitempty"`
}

// SemanticDiff is the full aggregate output of a diff operation.
type SemanticDiff struct {
	Source    string           `json:"source"`           // "pr#12", "local", "ref:main..head", "fixture:pr-12"
	BaseRef   string           `json:"base_ref,omitempty"`
	HeadRef   string           `json:"head_ref,omitempty"`
	Changes   []SemanticChange `json:"changes"`
	FileDiffs []FileChange     `json:"file_diffs"`
}

// DiffRefs compares baseRef → headRef and produces a SemanticDiff.
func (r *Repo) DiffRefs(baseRef, headRef string) (*SemanticDiff, error) {
	baseHash, err := r.ResolveRef(baseRef)
	if err != nil {
		return nil, err
	}
	headHash, err := r.ResolveRef(headRef)
	if err != nil {
		return nil, err
	}
	baseTree, err := r.commitTree(baseHash)
	if err != nil {
		return nil, err
	}
	headTree, err := r.commitTree(headHash)
	if err != nil {
		return nil, err
	}
	patch, err := baseTree.Patch(headTree)
	if err != nil {
		return nil, err
	}
	return buildSemanticDiff(
		fmt.Sprintf("ref:%s..%s", short(baseHash), short(headHash)),
		baseRef, headRef, patch, blobReader{
			before: func(p string) ([]byte, error) { return readTreeFile(baseTree, p) },
			after:  func(p string) ([]byte, error) { return readTreeFile(headTree, p) },
		})
}

// DiffWorkingTree compares HEAD → working tree and produces a SemanticDiff.
func (r *Repo) DiffWorkingTree() (*SemanticDiff, error) {
	headRef, err := r.repo.Head()
	if err != nil {
		return nil, err
	}
	headCommit, err := r.repo.CommitObject(headRef.Hash())
	if err != nil {
		return nil, err
	}
	headTree, err := headCommit.Tree()
	if err != nil {
		return nil, err
	}

	st, err := r.Status()
	if err != nil {
		return nil, err
	}

	out := &SemanticDiff{
		Source:  "local",
		HeadRef: headRef.Hash().String(),
	}
	for _, e := range st {
		fc := FileChange{Op: e.Op, Path: e.Path}
		out.FileDiffs = append(out.FileDiffs, fc)
		if !isRecordPath(e.Path) {
			continue
		}
		var before, after []byte
		if e.Op != "+" && e.Op != "?" {
			if b, _ := readTreeFile(headTree, e.Path); b != nil {
				before = b
			}
		}
		if e.Op != "-" {
			b, rerr := r.ReadBlobInWorktree(e.Path)
			if rerr == nil {
				after = b
			}
		}
		sc, derr := buildSemanticChange(e.Path, before, after)
		if derr == nil && sc != nil {
			out.Changes = append(out.Changes, *sc)
		}
	}
	sort.SliceStable(out.FileDiffs, func(i, j int) bool { return out.FileDiffs[i].Path < out.FileDiffs[j].Path })
	sort.SliceStable(out.Changes, func(i, j int) bool { return out.Changes[i].Path < out.Changes[j].Path })
	return out, nil
}

// ─────────── shared diff plumbing ───────────

type blobReader struct {
	before func(path string) ([]byte, error)
	after  func(path string) ([]byte, error)
}

func buildSemanticDiff(source, baseRef, headRef string, patch *object.Patch, br blobReader) (*SemanticDiff, error) {
	out := &SemanticDiff{
		Source:  source,
		BaseRef: baseRef,
		HeadRef: headRef,
	}
	for _, fp := range patch.FilePatches() {
		from, to := fp.Files()
		path := ""
		op := "M"
		switch {
		case from == nil && to != nil:
			path = to.Path()
			op = "+"
		case from != nil && to == nil:
			path = from.Path()
			op = "-"
		case from != nil && to != nil:
			path = to.Path()
			op = "M"
			if from.Path() != to.Path() {
				// Rename — record both as separate file diffs for the UI.
				out.FileDiffs = append(out.FileDiffs, FileChange{Op: "-", Path: from.Path()})
				out.FileDiffs = append(out.FileDiffs, FileChange{Op: "+", Path: to.Path()})
			}
		default:
			continue
		}
		added, removed := countLines(fp.Chunks())
		out.FileDiffs = append(out.FileDiffs, FileChange{Op: op, Path: path, Added: added, Removed: removed})

		if !isRecordPath(path) {
			continue
		}
		var before, after []byte
		var berr, aerr error
		if op != "+" {
			before, berr = br.before(path)
		}
		if op != "-" {
			after, aerr = br.after(path)
		}
		if berr != nil && !errors.Is(berr, object.ErrFileNotFound) {
			return nil, berr
		}
		if aerr != nil && !errors.Is(aerr, object.ErrFileNotFound) {
			return nil, aerr
		}
		sc, derr := buildSemanticChange(path, before, after)
		if derr == nil && sc != nil {
			out.Changes = append(out.Changes, *sc)
		}
	}
	sort.SliceStable(out.FileDiffs, func(i, j int) bool { return out.FileDiffs[i].Path < out.FileDiffs[j].Path })
	sort.SliceStable(out.Changes, func(i, j int) bool { return out.Changes[i].Path < out.Changes[j].Path })
	return out, nil
}

func countLines(chunks []gitdiff.Chunk) (added, removed int) {
	for _, ch := range chunks {
		text := ch.Content()
		n := strings.Count(text, "\n")
		if !strings.HasSuffix(text, "\n") && text != "" {
			n++
		}
		switch ch.Type() {
		case gitdiff.Add:
			added += n
		case gitdiff.Delete:
			removed += n
		}
	}
	return
}

// buildSemanticChange decodes before/after JSON and emits a SemanticChange.
// Returns (nil, nil) for non-record paths or malformed JSON we cannot parse.
func buildSemanticChange(path string, before, after []byte) (*SemanticChange, error) {
	cls := classifyPath(path)
	if cls != ClassPrimitive && cls != ClassBundle {
		return nil, nil
	}
	var bDoc, aDoc map[string]any
	if before != nil {
		if err := json.Unmarshal(before, &bDoc); err != nil {
			return nil, fmt.Errorf("%s: parse before: %w", path, err)
		}
	}
	if after != nil {
		if err := json.Unmarshal(after, &aDoc); err != nil {
			return nil, fmt.Errorf("%s: parse after: %w", path, err)
		}
	}
	sc := &SemanticChange{
		Class:  cls,
		Path:   path,
		Before: bDoc,
		After:  aDoc,
	}
	switch {
	case bDoc == nil && aDoc != nil:
		sc.Op = OpAdded
	case bDoc != nil && aDoc == nil:
		sc.Op = OpDeleted
	default:
		sc.Op = OpModified
	}

	doc := aDoc
	if doc == nil {
		doc = bDoc
	}
	if s, _ := doc["slug"].(string); s != "" {
		sc.Slug = s
	}
	if cls == ClassPrimitive {
		if k, _ := doc["kind"].(string); k != "" {
			sc.Kind = k
		}
	} else {
		sc.Kind = "bundle"
	}

	if sc.Op == OpModified && bDoc != nil && aDoc != nil {
		sc.computeModifiedSubChanges()
	}
	return sc, nil
}

func (sc *SemanticChange) computeModifiedSubChanges() {
	bh, _ := sc.Before["content_hash"].(string)
	ah, _ := sc.After["content_hash"].(string)
	sc.HashChanged = bh != ah

	bRels, _ := sc.Before["relationships"].([]any)
	aRels, _ := sc.After["relationships"].([]any)
	if !relsEqual(bRels, aRels) {
		sc.RelationshipsChanged = true
		sc.NewRelationships, sc.DroppedRelationships = diffRels(bRels, aRels)
	}

	bp, _ := sc.Before["properties"].(map[string]any)
	ap, _ := sc.After["properties"].(map[string]any)
	if bp != nil || ap != nil {
		bLic, _ := bp["license"].(string)
		aLic, _ := ap["license"].(string)
		sc.LicenseChanged = bLic != aLic
		bNames, _ := bp["names"].(map[string]any)
		aNames, _ := ap["names"].(map[string]any)
		if !jsonEqual(bNames, aNames) {
			sc.NamesChanged = true
		}
	}

	if !jsonEqual(sc.Before, sc.After) {
		sc.BodyChanged = true
	}
}

func relsEqual(a, b []any) bool {
	if len(a) != len(b) {
		return false
	}
	return jsonEqual(a, b)
}

func diffRels(before, after []any) (added, dropped []map[string]any) {
	hashKey := func(rel any) string {
		m, _ := rel.(map[string]any)
		t, _ := m["type"].(string)
		tg, _ := m["target"].(map[string]any)
		id, _ := tg["id"].(string)
		h, _ := tg["hash"].(string)
		return t + "|" + id + "|" + h
	}
	bIdx := map[string]map[string]any{}
	for _, r := range before {
		bIdx[hashKey(r)] = toMap(r)
	}
	aIdx := map[string]map[string]any{}
	for _, r := range after {
		aIdx[hashKey(r)] = toMap(r)
	}
	for k, v := range aIdx {
		if _, ok := bIdx[k]; !ok {
			added = append(added, v)
		}
	}
	for k, v := range bIdx {
		if _, ok := aIdx[k]; !ok {
			dropped = append(dropped, v)
		}
	}
	return
}

func toMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func jsonEqual(a, b any) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}

func classifyPath(p string) RecordClass {
	p = filepath.ToSlash(p)
	switch {
	case strings.HasPrefix(p, "primitives/") && strings.HasSuffix(p, ".json"):
		return ClassPrimitive
	case strings.HasPrefix(p, "bundles/") && strings.HasSuffix(p, ".json"):
		return ClassBundle
	case strings.HasPrefix(p, "indexes/") && strings.HasSuffix(p, ".json"):
		return ClassIndex
	default:
		return ClassOther
	}
}

func isRecordPath(p string) bool {
	c := classifyPath(p)
	return c == ClassPrimitive || c == ClassBundle
}

func readTreeFile(t *object.Tree, posix string) ([]byte, error) {
	f, err := t.File(strings.TrimPrefix(posix, "/"))
	if err != nil {
		if errors.Is(err, object.ErrFileNotFound) {
			return nil, nil
		}
		return nil, err
	}
	rd, err := f.Reader()
	if err != nil {
		return nil, err
	}
	defer rd.Close()
	buf := make([]byte, 0, f.Size)
	tmp := make([]byte, 4096)
	for {
		n, rerr := rd.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if rerr != nil {
			break
		}
	}
	return buf, nil
}

func short(h plumbing.Hash) string {
	s := h.String()
	if len(s) > 7 {
		return s[:7]
	}
	return s
}

// avoid unused-import errors if gogit symbols drift across versions.
var _ = gogit.NoErrAlreadyUpToDate
