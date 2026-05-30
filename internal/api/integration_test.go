package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/Skund404/commons-tool/internal/hash"
	"github.com/Skund404/commons-tool/internal/indexer"
	"github.com/Skund404/commons-tool/internal/state"
)

// mockSrc resolves the mock corpus location for integration tests. Order:
//  1. $COMMONS_MOCK_PATH env var (CI sets this to the cloned proto-commons
//     test-corpus checkout)
//  2. <repo-root>/.cache/proto-commons (the location `make fetch-mock` uses)
//  3. ../../Rillmark/_Proto-Commons/mock relative to this file (Pascal's vault)
//
// Tests that cannot resolve any of these locations skip rather than fail —
// keeps the package green on a fresh clone without test data.
func mockSrc(t *testing.T) string {
	t.Helper()
	if p := os.Getenv("COMMONS_MOCK_PATH"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	candidates := []string{
		filepath.FromSlash("../../.cache/proto-commons"),
		filepath.FromSlash(`F:\Rillmark\_Proto-Commons\mock`),
		filepath.FromSlash("../../../Rillmark/_Proto-Commons/mock"),
	}
	// Prefer a corpus that carries the Addendum 1.0 category skeleton — a stale
	// .cache clone from before the addendum has no indexes/categories and would
	// fail the taxonomy-membership gate.
	var firstExisting string
	for _, c := range candidates {
		if _, err := os.Stat(c); err != nil {
			continue
		}
		if firstExisting == "" {
			firstExisting = c
		}
		if _, err := os.Stat(filepath.Join(c, "indexes", "categories")); err == nil {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	if firstExisting != "" {
		abs, _ := filepath.Abs(firstExisting)
		return abs
	}
	t.Skip("mock corpus not found; set COMMONS_MOCK_PATH or run `make fetch-mock`")
	return ""
}

// newIntegrationServer copies the mock corpus into a fresh tempdir, opens a
// state store inside that dir, and returns a fully wired *Server plus the
// tempdir path so the caller can inspect the working tree after the request.
func newIntegrationServer(t *testing.T) (*Server, string, *httptest.Server) {
	t.Helper()
	tmp := t.TempDir()
	corpus := filepath.Join(tmp, "corpus")
	if err := copyDir(mockSrc(t), corpus); err != nil {
		t.Fatalf("seed corpus: %v", err)
	}
	st, err := state.Open(filepath.Join(tmp, "state.sqlite"))
	if err != nil {
		t.Fatalf("state: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	srv := NewServer(corpus, "")
	srv.State = st
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	return srv, corpus, httpSrv
}

// TestPrimitiveCreateIntegration is the headline end-to-end test the followup
// prompt calls out: POST a new primitive, verify every downstream invariant.
func TestPrimitiveCreateIntegration(t *testing.T) {
	srv, corpus, ts := newIntegrationServer(t)

	body := map[string]any{
		"slug":    "scratch-awl",
		"kind":    "tool",
		"name":    "Scratch Awl",
		"desc":    "Single-point awl for surface marking.",
		"emitter": "opg://1f2e3d4c-5b6a-7980-1234-567890abcdef",
		"license": "CC-BY-4.0",
		"tags":    []any{"piercing", "marking"},
		"names": map[string]any{
			"en": map[string]any{"canonical": "scratch awl", "aliases": []any{}},
			"de": map[string]any{"canonical": "Reißahle", "aliases": []any{}},
			"fr": map[string]any{"canonical": "alène à tracer", "aliases": []any{}},
		},
		"taxonomy": "awl",
		"rel":      []any{},
		"domain":   map[string]any{"category": "piercing", "manufacturer": nil},
	}
	res := postJSON(t, ts, "/api/primitives", body)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("want 201, got %d (%s)", res.StatusCode, readAll(t, res))
	}
	var created integrationResult
	must(t, json.NewDecoder(res.Body).Decode(&created))

	// 1. File written at the canonical path.
	target := filepath.Join(corpus, "primitives", "tools", "scratch-awl.json")
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("file not written: %v", err)
	}

	// 2. content_hash on disk matches the canonical hasher.
	raw, _ := os.ReadFile(target)
	var onDisk map[string]any
	must(t, json.Unmarshal(raw, &onDisk))
	expectedHash, err := hash.Compute(onDisk)
	if err != nil {
		t.Fatal(err)
	}
	if claimed, _ := onDisk["content_hash"].(string); claimed != expectedHash {
		t.Fatalf("content_hash mismatch:\n  on-disk: %s\n  recomputed: %s", claimed, expectedHash)
	}

	// 3. Resolve indexes contain the new primitive's localized names (entries are
	// nested under "entries" per the addendum, and values are always lists).
	resolveEN := loadJSON(t, filepath.Join(corpus, "indexes", "resolve", "en.json"))
	enEntries, _ := resolveEN.(map[string]any)["entries"].(map[string]any)
	if _, ok := enEntries["scratch awl"]; !ok {
		t.Fatalf("resolve/en.json missing 'scratch awl' key")
	}
	resolveDE := loadJSON(t, filepath.Join(corpus, "indexes", "resolve", "de.json"))
	deEntries, _ := resolveDE.(map[string]any)["entries"].(map[string]any)
	if _, ok := deEntries[indexer.NormalizeKey("Reißahle")]; !ok {
		t.Fatalf("resolve/de.json missing normalized 'Reißahle'")
	}

	// 4. Taxonomy index shows scratch-awl as a member of category/awl (it declares
	// properties.taxonomy: "awl", and the mock skeleton has that category).
	taxEN := loadJSON(t, filepath.Join(corpus, "indexes", "taxonomy", "en.json"))
	tree, _ := taxEN.(map[string]any)["tree"].(map[string]any)
	awlNode, ok := tree["category/awl"].(map[string]any)
	if !ok {
		t.Fatalf("taxonomy/en.json missing category/awl root")
	}
	members, _ := awlNode["members"].([]any)
	found := false
	for _, c := range members {
		cm, _ := c.(map[string]any)
		if s, _ := cm["slug"].(string); s == "scratch-awl" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("scratch-awl not listed under awl in taxonomy/en.json")
	}

	// 5. Bundle hash refs still resolve.
	newCorpus, err := indexer.LoadCorpus(corpus, "primitives")
	if err != nil {
		t.Fatal(err)
	}
	known := map[string]bool{}
	for _, it := range newCorpus {
		if h, _ := it.Doc["content_hash"].(string); h != "" {
			known[h] = true
		}
	}
	bundles, _ := readBundles(corpus)
	for _, b := range bundles {
		items, _ := b["items"].([]any)
		for _, raw := range items {
			it, _ := raw.(map[string]any)
			if cls, _ := it["record_class"].(string); cls != "primitive" {
				continue
			}
			if h, _ := it["hash"].(string); !known[h] {
				slug, _ := b["slug"].(string)
				t.Errorf("bundle %s lost a hash ref to %s after integration", slug, h)
			}
		}
	}

	// 6. Category skeleton + membership clean.
	cats, _ := indexer.LoadCategories(srv.CorpusRoot)
	skelErrs := indexer.ValidateSkeleton(cats)
	skelErrs = append(skelErrs, indexer.ValidateMembership(cats, newCorpus)...)
	if len(skelErrs) > 0 {
		t.Errorf("skeleton/membership errors after integration: %v", skelErrs)
	}

	// 7. State store recorded last_validation row.
	lv, err := srv.State.LastValidation()
	if err != nil {
		t.Fatal(err)
	}
	if lv == nil {
		t.Fatal("expected state to have recorded a validation row")
	}
	if !lv.OK {
		t.Errorf("recorded validation should be OK=true, got %+v", lv)
	}
}

// TestPrimitiveForkIntegration covers the fork path, including auto-slug
// generation and the appended predecessor + derived_from relationships.
func TestPrimitiveForkIntegration(t *testing.T) {
	_, corpus, ts := newIntegrationServer(t)

	res := postJSON(t, ts, "/api/primitives/osborne-diamond-awl/fork", map[string]any{})
	if res.StatusCode != 201 {
		t.Fatalf("want 201, got %d (%s)", res.StatusCode, readAll(t, res))
	}
	var out integrationResult
	must(t, json.NewDecoder(res.Body).Decode(&out))

	slug, _ := out.Primitive["slug"].(string)
	if slug != "osborne-diamond-awl-fork-1" {
		t.Errorf("auto-slug: want osborne-diamond-awl-fork-1, got %q", slug)
	}
	rels, _ := out.Primitive["relationships"].([]any)
	hasPredecessor := false
	hasDerived := false
	for _, raw := range rels {
		rel, _ := raw.(map[string]any)
		switch rel["type"] {
		case "predecessor":
			hasPredecessor = true
		case "derived_from":
			hasDerived = true
		}
	}
	if !hasPredecessor || !hasDerived {
		t.Errorf("fork must add predecessor + derived_from; got rels=%v", rels)
	}

	// File written.
	if _, err := os.Stat(filepath.Join(corpus, "primitives", "tools", "osborne-diamond-awl-fork-1.json")); err != nil {
		t.Errorf("fork file not written: %v", err)
	}
}

// TestSlugCollisionRejected confirms 409 on a duplicate-slug create.
func TestSlugCollisionRejected(t *testing.T) {
	_, _, ts := newIntegrationServer(t)

	body := map[string]any{
		"slug":    "round-knife", // already a primitive in the mock
		"kind":    "tool",
		"name":    "Another round knife",
		"emitter": "opg://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"license": "CC-BY-4.0",
		"names":   map[string]any{"en": map[string]any{"canonical": "another round knife", "aliases": []any{}}},
		"domain":  map[string]any{},
	}
	res := postJSON(t, ts, "/api/primitives", body)
	if res.StatusCode != 409 {
		t.Fatalf("want 409, got %d (%s)", res.StatusCode, readAll(t, res))
	}
}

// TestDeleteBlockedByReference confirms 409 when a primitive is referenced by
// another primitive's hash-pinned relationship. Self-contained: create a tool,
// then a technique that uses_tool it, then try to delete the tool.
func TestDeleteBlockedByReference(t *testing.T) {
	_, _, ts := newIntegrationServer(t)

	tool := map[string]any{
		"slug":    "ref-target-tool",
		"kind":    "tool",
		"name":    "Ref Target Tool",
		"emitter": "opg://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"license": "CC-BY-4.0",
		"names":   map[string]any{"en": map[string]any{"canonical": "ref target tool", "aliases": []any{}}},
		"domain":  map[string]any{},
	}
	if res := postJSON(t, ts, "/api/primitives", tool); res.StatusCode != 201 {
		t.Fatalf("create tool: %d (%s)", res.StatusCode, readAll(t, res))
	}

	tech := map[string]any{
		"slug":    "ref-source-technique",
		"kind":    "technique",
		"name":    "Ref Source Technique",
		"emitter": "opg://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"license": "CC-BY-4.0",
		"names":   map[string]any{"en": map[string]any{"canonical": "ref source technique", "aliases": []any{}}},
		"rel":     []any{map[string]any{"type": "uses_tool", "target": "ref-target-tool"}},
		"domain":  map[string]any{},
	}
	if res := postJSON(t, ts, "/api/primitives", tech); res.StatusCode != 201 {
		t.Fatalf("create technique: %d (%s)", res.StatusCode, readAll(t, res))
	}

	req, _ := http.NewRequest("DELETE", ts.URL+"/api/primitives/ref-target-tool", nil)
	res, err := httpClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 409 {
		t.Fatalf("want 409 (referenced), got %d (%s)", res.StatusCode, readAll(t, res))
	}
}

// TestDraftLifecycle exercises create → update → validate → stage.
func TestDraftLifecycle(t *testing.T) {
	_, corpus, ts := newIntegrationServer(t)

	// 1. Create empty draft.
	res := postJSON(t, ts, "/api/drafts/primitives", map[string]any{
		"slug": "stitching-chisel",
		"kind": "tool",
	})
	if res.StatusCode != 201 {
		t.Fatalf("create draft: %d (%s)", res.StatusCode, readAll(t, res))
	}
	var env draftEnvelope
	must(t, json.NewDecoder(res.Body).Decode(&env))
	if env.ID == "" {
		t.Fatal("draft id should be assigned")
	}

	// 2. Update with full body.
	full := map[string]any{
		"slug":    "stitching-chisel",
		"kind":    "tool",
		"name":    "Stitching Chisel",
		"desc":    "Pricking iron used to mark stitching holes.",
		"emitter": "opg://abcdefab-cdef-abcd-efab-cdefabcdefab",
		"license": "CC-BY-4.0",
		"tags":    []any{"piercing", "stitching"},
		"names": map[string]any{
			"en": map[string]any{"canonical": "stitching chisel", "aliases": []any{"pricking iron"}},
			"de": map[string]any{"canonical": "Stechzeug", "aliases": []any{}},
			"fr": map[string]any{"canonical": "griffe à frapper", "aliases": []any{}},
		},
		"rel":    []any{},
		"domain": map[string]any{"category": "piercing"},
	}
	res = putJSON(t, ts, "/api/drafts/primitives/"+env.ID, full)
	if res.StatusCode != 200 {
		t.Fatalf("update draft: %d (%s)", res.StatusCode, readAll(t, res))
	}

	// 3. Validate.
	res = postJSON(t, ts, "/api/drafts/primitives/"+env.ID+"/validate", nil)
	if res.StatusCode != 200 {
		t.Fatalf("validate draft: %d (%s)", res.StatusCode, readAll(t, res))
	}
	var validation struct {
		OK     bool `json:"ok"`
		Errors []struct {
			Sev string `json:"sev"`
		} `json:"errors"`
	}
	must(t, json.NewDecoder(res.Body).Decode(&validation))
	if !validation.OK {
		t.Errorf("validate should pass; got errors: %+v", validation.Errors)
	}

	// 4. Stage.
	res = postJSON(t, ts, "/api/drafts/primitives/"+env.ID+"/stage", nil)
	if res.StatusCode != 201 {
		t.Fatalf("stage draft: %d (%s)", res.StatusCode, readAll(t, res))
	}
	if _, err := os.Stat(filepath.Join(corpus, "primitives", "tools", "stitching-chisel.json")); err != nil {
		t.Errorf("staged primitive not on disk: %v", err)
	}
	// Draft removed.
	if _, err := os.Stat(filepath.Join(corpus, ".drafts", env.ID+".json")); err == nil {
		t.Errorf(".drafts file should be gone after stage")
	}
}

// ─────────── helpers ───────────

var httpClient = &http.Client{}

func postJSON(t *testing.T, srv *httptest.Server, path string, body any) *http.Response {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest("POST", srv.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	res, err := httpClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func putJSON(t *testing.T, srv *httptest.Server, path string, body any) *http.Response {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest("PUT", srv.URL+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	res, err := httpClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func readAll(t *testing.T, res *http.Response) string {
	t.Helper()
	b, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	return string(b)
}

func loadJSON(t *testing.T, path string) any {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var v any
	must(t, json.Unmarshal(b, &v))
	return v
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// copyDir recursively copies src to dst. Used to seed each test with a fresh
// mock corpus so writes can mutate without touching the vault.
func copyDir(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	for _, e := range entries {
		s := filepath.Join(src, e.Name())
		d := filepath.Join(dst, e.Name())
		if e.IsDir() {
			if err := copyDir(s, d); err != nil {
				return err
			}
			continue
		}
		b, err := os.ReadFile(s)
		if err != nil {
			return err
		}
		if err := os.WriteFile(d, b, 0o644); err != nil {
			return err
		}
	}
	return nil
}
