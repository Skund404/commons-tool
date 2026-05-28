package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Skund404/commons-tool/internal/hash"
	"github.com/Skund404/commons-tool/internal/indexer"
	"github.com/Skund404/commons-tool/internal/schema"
)

// integrationResult captures the outcome of a write-path operation. It is
// returned to the HTTP layer so handlers can shape success/warning bodies.
type integrationResult struct {
	Primitive map[string]any `json:"primitive"`
	UI        map[string]any `json:"ui,omitempty"`
	Warnings  []string       `json:"warnings,omitempty"`
}

// writeOp distinguishes create / update / stage so the pipeline can apply the
// right pre-checks (slug-already-exists is a collision on create, a 404 on
// update, etc.).
type writeOp string

const (
	opCreate writeOp = "create"
	opUpdate writeOp = "update"
)

// writePrimitivePipeline is the central integration funnel used by create,
// update, fork, and draft-stage. Inputs are the UI-shape body the frontend
// posts; outputs are the persisted spec-shape primitive plus any non-fatal
// warnings (e.g. bundle items whose hashes were re-pinned by the regen).
//
// HTTP semantics enforced here:
//
//	400 — schema or relationship resolution failure
//	409 — slug collision on create, or 404-equivalent on update
//	500 — disk / state failure
func (s *Server) writePrimitivePipeline(ui map[string]any, op writeOp, expectedSlug string) (*integrationResult, int, error) {
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	// 1. Reverse-project UI → spec.
	specDoc, resErrs := projectPrimitiveFromUI(uiProjectionInput{
		UI:      ui,
		Corpus:  corpus,
		NowDate: time.Now().UTC().Format("2006-01-02"),
	})
	if len(resErrs) > 0 {
		return nil, http.StatusBadRequest, formatResolutionErrors(resErrs)
	}

	slug, _ := specDoc["slug"].(string)
	kind, _ := specDoc["kind"].(string)
	if slug == "" || kind == "" {
		return nil, http.StatusBadRequest, errors.New("slug and kind are required")
	}
	if op == opUpdate && expectedSlug != "" && expectedSlug != slug {
		// Slug is immutable on PUT; rename requires delete + create.
		return nil, http.StatusBadRequest, fmt.Errorf("slug mismatch: path=%q body=%q (slug is immutable on update)", expectedSlug, slug)
	}

	// 2. Slug collision / existence.
	existing, existingIdx := findBySlug(corpus, slug)
	if op == opCreate && existing != nil {
		return nil, http.StatusConflict, fmt.Errorf("slug %q already exists at %s", slug, existing.Path)
	}
	if op == opUpdate && existing == nil {
		return nil, http.StatusNotFound, fmt.Errorf("no primitive with slug %q to update", slug)
	}

	// 3. Compute authoritative content_hash first (server is the source of
	// truth). Doing this before validation lets the validator's required-
	// content_hash gate pass with the freshly-computed value. The hash
	// preimage excludes the content_hash field, so injecting it does not
	// affect the canonical hash.
	specDoc["modified"] = time.Now().UTC().Format("2006-01-02")
	h, err := hash.Compute(specDoc)
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("hash: %w", err)
	}
	specDoc["content_hash"] = h

	// 4. Strict spec validation. Project to schema struct via marshal round-trip.
	if errs := runSchemaValidation(specDoc); len(errs) > 0 {
		return nil, http.StatusBadRequest, formatSchemaErrors(errs)
	}

	// 5. Cycle detection on the would-be-new corpus.
	overlay := corpusWithReplacement(corpus, existingIdx, indexer.Item{
		Path: posixJoin(kindPathOrPanic(kind), slug+".json"),
		Doc:  specDoc,
	})
	if cycErrs := indexer.DetectCycles(overlay); len(cycErrs) > 0 {
		// Filter "not in corpus" entries; those are dangling refs that the
		// resolver would have already caught above.
		var realCycles []string
		for _, e := range cycErrs {
			if strings.Contains(e, "cycle") {
				realCycles = append(realCycles, e)
			}
		}
		if len(realCycles) > 0 {
			return nil, http.StatusBadRequest, fmt.Errorf("specializes cycle introduced: %s", strings.Join(realCycles, "; "))
		}
	}

	// 6. Atomic write.
	relPath, err := kindPath(kind)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	absDir := filepath.Join(s.CorpusRoot, filepath.FromSlash(relPath))
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("mkdir: %w", err)
	}
	target := filepath.Join(absDir, slug+".json")
	if err := atomicWriteJSON(target, specDoc); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("write: %w", err)
	}

	// 7. Auto-regen indexes against the post-write corpus.
	newCorpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("reload corpus: %w", err)
	}
	if err := regenAllIndexes(s.CorpusRoot, newCorpus); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("regen indexes: %w", err)
	}

	// 8. Bundle integrity check — warn, don't block.
	warnings := bundleDanglingWarnings(s.CorpusRoot, newCorpus)

	// 9. State persistence.
	if s.State != nil {
		_ = s.State.RecordValidation(true, warnings, s.CorpusRoot)
		_ = s.State.RecordRecent(h, slug, kind, posixJoin(relPath, slug+".json"))
	}

	// 10. Build UI projection for the response.
	uiOut := projectPrimitiveToUI(indexer.Item{
		Path: posixJoin(relPath, slug+".json"),
		Doc:  specDoc,
	})

	return &integrationResult{
		Primitive: specDoc,
		UI:        uiOut,
		Warnings:  warnings,
	}, http.StatusOK, nil
}

// runSchemaValidation marshals the spec doc into the validator struct and
// returns any rule violations.
func runSchemaValidation(specDoc map[string]any) []error {
	raw, err := json.Marshal(specDoc)
	if err != nil {
		return []error{fmt.Errorf("re-marshal: %w", err)}
	}
	var p schema.Primitive
	if err := json.Unmarshal(raw, &p); err != nil {
		return []error{fmt.Errorf("re-parse: %w", err)}
	}
	return schema.ValidatePrimitive(&p)
}

// findBySlug returns the corpus item with the matching slug and its index in
// the corpus slice. (nil, -1) if absent.
func findBySlug(corpus []indexer.Item, slug string) (*indexer.Item, int) {
	for i := range corpus {
		if s, _ := corpus[i].Doc["slug"].(string); s == slug {
			return &corpus[i], i
		}
	}
	return nil, -1
}

// corpusWithReplacement returns a copy of corpus with the item at idx swapped
// for replacement. idx<0 appends.
func corpusWithReplacement(corpus []indexer.Item, idx int, replacement indexer.Item) []indexer.Item {
	out := make([]indexer.Item, 0, len(corpus)+1)
	if idx < 0 {
		out = append(out, corpus...)
		out = append(out, replacement)
		return out
	}
	out = append(out, corpus[:idx]...)
	out = append(out, replacement)
	out = append(out, corpus[idx+1:]...)
	return out
}

// regenAllIndexes rebuilds resolve + taxonomy indexes for every language and
// writes them under indexes/.
func regenAllIndexes(corpusRoot string, corpus []indexer.Item) error {
	resolve := indexer.BuildResolveIndexes(corpus)
	if err := indexer.WriteIndexes(filepath.Join(corpusRoot, "indexes", "resolve"), resolve); err != nil {
		return err
	}
	tax := indexer.BuildTaxonomyIndexes(corpus)
	return indexer.WriteIndexes(filepath.Join(corpusRoot, "indexes", "taxonomy"), tax)
}

// bundleDanglingWarnings returns one warning per bundle item whose pinned hash
// is no longer present in the corpus. Non-blocking — surfaces in the response
// so the maintainer can decide.
func bundleDanglingWarnings(corpusRoot string, corpus []indexer.Item) []string {
	known := map[string]bool{}
	for _, it := range corpus {
		if h, _ := it.Doc["content_hash"].(string); h != "" {
			known[h] = true
		}
	}
	bundles, _ := readBundles(corpusRoot)
	var out []string
	for _, b := range bundles {
		slug, _ := b["slug"].(string)
		items, _ := b["items"].([]any)
		for i, raw := range items {
			it, _ := raw.(map[string]any)
			cls, _ := it["record_class"].(string)
			if cls != "primitive" {
				continue
			}
			h, _ := it["hash"].(string)
			if h == "" || known[h] {
				continue
			}
			out = append(out, fmt.Sprintf("bundle %q items[%d] now pins missing hash %s", slug, i, h))
		}
	}
	return out
}

// atomicWriteJSON writes the doc as JSON with indent=2 + trailing newline,
// using rename-after-write to avoid half-written files.
func atomicWriteJSON(path string, doc any) error {
	tmp := path + ".tmp"
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func formatResolutionErrors(errs []ResolutionError) error {
	parts := make([]string, 0, len(errs))
	for _, e := range errs {
		parts = append(parts, e.Error())
	}
	return errors.New(strings.Join(parts, "; "))
}

func formatSchemaErrors(errs []error) error {
	parts := make([]string, 0, len(errs))
	for _, e := range errs {
		parts = append(parts, e.Error())
	}
	return errors.New(strings.Join(parts, "; "))
}

func posixJoin(parts ...string) string {
	return strings.Join(parts, "/")
}

func kindPathOrPanic(kind string) string {
	p, err := kindPath(kind)
	if err != nil {
		// This is a programming error in the projection — kind was validated.
		// Panic is acceptable for an internal invariant; callers won't reach
		// this path unless the projection produced an invalid kind.
		panic(err)
	}
	return p
}

// ─────────── HTTP handlers ───────────

// handlePrimitiveCreate handles POST /api/primitives.
func (s *Server) handlePrimitiveCreate(w http.ResponseWriter, r *http.Request) {
	var ui map[string]any
	if err := json.NewDecoder(r.Body).Decode(&ui); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	res, status, err := s.writePrimitivePipeline(ui, opCreate, "")
	if err != nil {
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

// handlePrimitiveUpdate handles PUT /api/primitives/{slug}.
func (s *Server) handlePrimitiveUpdate(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	var ui map[string]any
	if err := json.NewDecoder(r.Body).Decode(&ui); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	// If caller omitted slug in body, lift it from the path.
	if _, ok := ui["slug"].(string); !ok {
		ui["slug"] = slug
	}
	res, status, err := s.writePrimitivePipeline(ui, opUpdate, slug)
	if err != nil {
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// handlePrimitiveDelete handles DELETE /api/primitives/{slug}. Enforces
// referential integrity: any primitive that relates to this one (or any
// bundle that pins its hash) blocks the delete.
func (s *Server) handlePrimitiveDelete(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	target, idx := findBySlug(corpus, slug)
	if target == nil {
		writeError(w, 404, "primitive not found")
		return
	}
	hashStr, _ := target.Doc["content_hash"].(string)

	// 1. Inbound primitive relationships.
	var blockers []string
	for i, it := range corpus {
		if i == idx {
			continue
		}
		rels, _ := it.Doc["relationships"].([]any)
		for j, raw := range rels {
			rel, _ := raw.(map[string]any)
			tg, _ := rel["target"].(map[string]any)
			th, _ := tg["hash"].(string)
			if th == hashStr {
				otherSlug, _ := it.Doc["slug"].(string)
				rt, _ := rel["type"].(string)
				blockers = append(blockers,
					fmt.Sprintf("%s relationships[%d] (%s) pins this primitive", otherSlug, j, rt))
			}
		}
	}

	// 2. Bundle item refs.
	bundles, _ := readBundles(s.CorpusRoot)
	for _, b := range bundles {
		bs, _ := b["slug"].(string)
		items, _ := b["items"].([]any)
		for i, raw := range items {
			it, _ := raw.(map[string]any)
			if h, _ := it["hash"].(string); h == hashStr {
				blockers = append(blockers,
					fmt.Sprintf("bundle %q items[%d] pins this primitive", bs, i))
			}
		}
	}

	if len(blockers) > 0 {
		writeError(w, http.StatusConflict, "cannot delete; referenced by: "+strings.Join(blockers, "; "))
		return
	}

	// 3. Remove file.
	abs := filepath.Join(s.CorpusRoot, filepath.FromSlash(target.Path))
	if err := os.Remove(abs); err != nil {
		writeError(w, 500, err.Error())
		return
	}

	// 4. Regen indexes against the post-delete corpus.
	newCorpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if err := regenAllIndexes(s.CorpusRoot, newCorpus); err != nil {
		writeError(w, 500, err.Error())
		return
	}

	if s.State != nil {
		_ = s.State.RecordValidation(true, []string{"delete: " + slug}, s.CorpusRoot)
	}
	writeJSON(w, 200, map[string]any{"ok": true, "deleted": slug})
}

// handlePrimitiveFork handles POST /api/primitives/{slug}/fork. The caller
// MAY supply a body with overrides (e.g. {"slug": "...", "names": {...}}).
// Anything not overridden inherits from the source. The fork picks up
// `predecessor` + `derived_from` relationships pointing at the source.
func (s *Server) handlePrimitiveFork(w http.ResponseWriter, r *http.Request) {
	srcSlug := r.PathValue("slug")
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	source, _ := findBySlug(corpus, srcSlug)
	if source == nil {
		writeError(w, 404, "source primitive not found")
		return
	}

	// Read overrides if any (empty body is fine).
	var overrides map[string]any
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&overrides)
	}

	// Build a UI-shape doc from the source via the existing projection so the
	// shape matches what the write pipeline expects.
	uiBase := projectPrimitiveToUI(*source)

	// Slug: caller override wins; else <src-slug>-fork-N where N is first free.
	newSlug, _ := overrides["slug"].(string)
	if newSlug == "" {
		newSlug = nextForkSlug(corpus, srcSlug)
	}

	// New id; never reuse the source's id.
	newID := newSlug + "-" + time.Now().UTC().Format("20060102")

	// Inherit/override fields.
	uiBase["slug"] = newSlug
	uiBase["id"] = newID
	if v, ok := overrides["name"]; ok {
		uiBase["name"] = v
	} else {
		base, _ := uiBase["name"].(string)
		uiBase["name"] = base + " (fork)"
	}
	if v, ok := overrides["desc"]; ok {
		uiBase["desc"] = v
	}
	if v, ok := overrides["emitter"]; ok {
		uiBase["emitter"] = v
	}
	if v, ok := overrides["names"]; ok {
		uiBase["names"] = v
	}
	if v, ok := overrides["domain"]; ok {
		uiBase["domain"] = v
	}
	if v, ok := overrides["tags"]; ok {
		uiBase["tags"] = v
	}

	// Append predecessor + derived_from relationships pointing at the source.
	rels, _ := uiBase["rel"].([]any)
	if rels == nil {
		rels = []any{}
	}
	rels = append(rels,
		map[string]any{"type": "predecessor", "target": srcSlug},
		map[string]any{"type": "derived_from", "target": srcSlug},
	)
	uiBase["rel"] = rels

	res, status, err := s.writePrimitivePipeline(uiBase, opCreate, "")
	if err != nil {
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

// nextForkSlug picks the first N >= 1 such that <srcSlug>-fork-N is not in use.
func nextForkSlug(corpus []indexer.Item, srcSlug string) string {
	used := map[string]bool{}
	for _, it := range corpus {
		if s, _ := it.Doc["slug"].(string); s != "" {
			used[s] = true
		}
	}
	for n := 1; n < 10_000; n++ {
		candidate := fmt.Sprintf("%s-fork-%d", srcSlug, n)
		if !used[candidate] {
			return candidate
		}
	}
	return fmt.Sprintf("%s-fork-%d", srcSlug, time.Now().UnixNano())
}
