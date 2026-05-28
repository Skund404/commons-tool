package diff

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	commonsgit "github.com/Skund404/commons-tool/internal/git"
	"github.com/Skund404/commons-tool/internal/hash"
)

//go:embed fixtures/*.json
var fixturesFS embed.FS

// FixturePR is the demo PR shape, designed so the recommender can run end-to-
// end without GitHub network state. Fixtures are bundled into the binary
// (//go:embed) so the Review pane shows live recommendations from day one.
type FixturePR struct {
	Number     int                  `json:"id"`
	Title      string               `json:"title"`
	Author     string               `json:"author"`
	AuthorMeta string               `json:"author_meta"`
	Branch     string               `json:"branch"`
	Age        string               `json:"age"`
	Files      []commonsgit.FileChange `json:"files"`
	Semantic   []string             `json:"semantic"`
	Proposed   ProposedState        `json:"proposed"`
}

// ProposedState is the post-merge slice the PR proposes.
type ProposedState struct {
	AddedPrimitives    []FixturePrimitive `json:"added_primitives,omitempty"`
	ModifiedPrimitives []FixtureModified  `json:"modified_primitives,omitempty"`
	DeletedPrimitives  []FixturePrimitive `json:"deleted_primitives,omitempty"`
	AddedBundles       []FixturePrimitive `json:"added_bundles,omitempty"`
	ModifiedBundles    []FixtureModified  `json:"modified_bundles,omitempty"`
	DeletedBundles     []FixturePrimitive `json:"deleted_bundles,omitempty"`
}

// FixturePrimitive wraps an added/deleted record with its repo-relative path.
type FixturePrimitive struct {
	Path string         `json:"path"`
	Doc  map[string]any `json:"doc"`
}

// FixtureModified wraps a modified record with both before and after bodies.
type FixtureModified struct {
	Path   string         `json:"path"`
	Before map[string]any `json:"before"`
	After  map[string]any `json:"after"`
}

// LoadFixturePRs returns all bundled synthetic PRs, sorted by number desc.
// For every primitive/bundle body, the canonical content_hash is recomputed
// and injected so downstream gates exercise the real hasher.
func LoadFixturePRs() ([]FixturePR, error) {
	var out []FixturePR
	err := fs.WalkDir(fixturesFS, "fixtures", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}
		raw, err := fs.ReadFile(fixturesFS, path)
		if err != nil {
			return err
		}
		var pr FixturePR
		if err := json.Unmarshal(raw, &pr); err != nil {
			return fmt.Errorf("fixture %s: %w", path, err)
		}
		if err := pr.NormalizeHashes(); err != nil {
			return fmt.Errorf("fixture %s: normalize hashes: %w", path, err)
		}
		out = append(out, pr)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Number > out[j].Number })
	return out, nil
}

// NormalizeHashes walks each proposed primitive/bundle and recomputes its
// content_hash to keep the fixture self-consistent with the canonical hasher.
//
// Special handling: if any relationship's target.hash starts with
// "sha256:PLACEHOLDER_<KEY>", it is rewritten with the canonical hash of
// whichever sibling primitive's id matches <KEY> (case-insensitive on the
// kebab/snake transform). This lets a fixture express "specializes its
// sibling in this PR" without baking in computed hashes by hand.
func (pr *FixturePR) NormalizeHashes() error {
	// Pass 1: compute canonical hashes for every added primitive/bundle, so
	// downstream relationship-target placeholders can be resolved.
	idToHash := map[string]string{}
	for i := range pr.Proposed.AddedPrimitives {
		h, err := hash.Compute(pr.Proposed.AddedPrimitives[i].Doc)
		if err != nil {
			return err
		}
		pr.Proposed.AddedPrimitives[i].Doc["content_hash"] = h
		if id, _ := pr.Proposed.AddedPrimitives[i].Doc["id"].(string); id != "" {
			idToHash[id] = h
			slugKey := strings.ToUpper(strings.ReplaceAll(id, "-", "_"))
			idToHash[slugKey] = h
		}
		if slug, _ := pr.Proposed.AddedPrimitives[i].Doc["slug"].(string); slug != "" {
			slugKey := strings.ToUpper(strings.ReplaceAll(slug, "-", "_"))
			idToHash[slugKey] = h
		}
	}
	// Pass 2: rewrite relationship target placeholders, then recompute the
	// dependent primitive's content_hash now that the body changed.
	for i := range pr.Proposed.AddedPrimitives {
		rewritten := resolveRelationshipPlaceholders(pr.Proposed.AddedPrimitives[i].Doc, idToHash)
		if rewritten {
			h, err := hash.Compute(pr.Proposed.AddedPrimitives[i].Doc)
			if err != nil {
				return err
			}
			pr.Proposed.AddedPrimitives[i].Doc["content_hash"] = h
		}
	}
	for i := range pr.Proposed.ModifiedPrimitives {
		if pr.Proposed.ModifiedPrimitives[i].After != nil {
			h, err := hash.Compute(pr.Proposed.ModifiedPrimitives[i].After)
			if err != nil {
				return err
			}
			pr.Proposed.ModifiedPrimitives[i].After["content_hash"] = h
		}
	}
	for i := range pr.Proposed.AddedBundles {
		h, err := hash.Compute(pr.Proposed.AddedBundles[i].Doc)
		if err != nil {
			return err
		}
		pr.Proposed.AddedBundles[i].Doc["content_hash"] = h
	}
	return nil
}

// ToDiff converts a fixture PR to a SemanticDiff the recommender consumes.
func (pr *FixturePR) ToDiff() *commonsgit.SemanticDiff {
	out := &commonsgit.SemanticDiff{
		Source:    fmt.Sprintf("fixture:pr-%d", pr.Number),
		FileDiffs: append([]commonsgit.FileChange(nil), pr.Files...),
	}
	for _, p := range pr.Proposed.AddedPrimitives {
		slug, _ := p.Doc["slug"].(string)
		kind, _ := p.Doc["kind"].(string)
		out.Changes = append(out.Changes, commonsgit.SemanticChange{
			Op:    commonsgit.OpAdded,
			Class: commonsgit.ClassPrimitive,
			Path:  p.Path,
			Slug:  slug,
			Kind:  kind,
			After: p.Doc,
		})
	}
	for _, p := range pr.Proposed.ModifiedPrimitives {
		doc := p.After
		if doc == nil {
			doc = p.Before
		}
		slug, _ := doc["slug"].(string)
		kind, _ := doc["kind"].(string)
		sc := commonsgit.SemanticChange{
			Op:     commonsgit.OpModified,
			Class:  commonsgit.ClassPrimitive,
			Path:   p.Path,
			Slug:   slug,
			Kind:   kind,
			Before: p.Before,
			After:  p.After,
		}
		// Compute sub-flags using the same helper the real diff parser uses.
		fillModifiedFlags(&sc)
		out.Changes = append(out.Changes, sc)
	}
	for _, p := range pr.Proposed.DeletedPrimitives {
		slug, _ := p.Doc["slug"].(string)
		kind, _ := p.Doc["kind"].(string)
		out.Changes = append(out.Changes, commonsgit.SemanticChange{
			Op:     commonsgit.OpDeleted,
			Class:  commonsgit.ClassPrimitive,
			Path:   p.Path,
			Slug:   slug,
			Kind:   kind,
			Before: p.Doc,
		})
	}
	for _, p := range pr.Proposed.AddedBundles {
		slug, _ := p.Doc["slug"].(string)
		out.Changes = append(out.Changes, commonsgit.SemanticChange{
			Op:    commonsgit.OpAdded,
			Class: commonsgit.ClassBundle,
			Path:  p.Path,
			Slug:  slug,
			Kind:  "bundle",
			After: p.Doc,
		})
	}
	return out
}

// fillModifiedFlags fills in the sub-change flags on a modified change using
// before/after maps. Mirrors git.computeModifiedSubChanges so fixture diffs
// behave like real ones.
func fillModifiedFlags(sc *commonsgit.SemanticChange) {
	if sc.Before == nil || sc.After == nil {
		return
	}
	bh, _ := sc.Before["content_hash"].(string)
	ah, _ := sc.After["content_hash"].(string)
	sc.HashChanged = bh != ah

	bRels, _ := sc.Before["relationships"].([]any)
	aRels, _ := sc.After["relationships"].([]any)
	if !jsonEq(bRels, aRels) {
		sc.RelationshipsChanged = true
	}

	bp, _ := sc.Before["properties"].(map[string]any)
	ap, _ := sc.After["properties"].(map[string]any)
	if bp != nil || ap != nil {
		bLic, _ := bp["license"].(string)
		aLic, _ := ap["license"].(string)
		sc.LicenseChanged = bLic != aLic
		bNames, _ := bp["names"].(map[string]any)
		aNames, _ := ap["names"].(map[string]any)
		if !jsonEq(bNames, aNames) {
			sc.NamesChanged = true
		}
	}
	if !jsonEq(sc.Before, sc.After) {
		sc.BodyChanged = true
	}
}

func jsonEq(a, b any) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}

// resolveRelationshipPlaceholders rewrites
// sha256:PLACEHOLDER_<KEY> target hashes using idToHash. Returns whether any
// rewrite happened (so the caller knows to recompute the dependent hash).
func resolveRelationshipPlaceholders(doc map[string]any, idToHash map[string]string) bool {
	rels, _ := doc["relationships"].([]any)
	changed := false
	for _, r := range rels {
		rel, _ := r.(map[string]any)
		if rel == nil {
			continue
		}
		t, _ := rel["target"].(map[string]any)
		if t == nil {
			continue
		}
		cur, _ := t["hash"].(string)
		const prefix = "sha256:PLACEHOLDER_"
		if !strings.HasPrefix(cur, prefix) {
			continue
		}
		key := strings.TrimPrefix(cur, prefix)
		// Try direct ID, then upper/snake-converted forms.
		if h, ok := idToHash[key]; ok {
			t["hash"] = h
			changed = true
			continue
		}
		if h, ok := idToHash[strings.ToUpper(key)]; ok {
			t["hash"] = h
			changed = true
		}
	}
	return changed
}
