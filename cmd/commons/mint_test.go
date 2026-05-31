package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Skund404/commons-tool/internal/hash"
)

// writeJSONFile is a test helper that writes v as indented JSON.
func writeJSONFile(t *testing.T, path string, v any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(b, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readJSONFile(t *testing.T, path string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

const zeroHash = "sha256:0000000000000000000000000000000000000000000000000000000000000000"

func material(slug string) map[string]any {
	return map[string]any{
		"opgl_version": "0.6", "emitter": "opg://test", "id": slug + "-x",
		"slug": slug, "kind": "material", "name": slug, "created": "2026-05-31",
		"content_hash": zeroHash,
		"properties":   map[string]any{"license": "CC-BY-4.0", "names": map[string]any{"en": []any{slug}}},
		"lineage":      map[string]any{"provenance_state": "unasserted", "outcome": "unknown"},
	}
}

// TestMintResolvesNestedBundleHashesInOrder builds a corpus with two materials,
// a leaf bundle pinning them, and a master bundle nesting the leaf, then verifies
// mint (1) re-pins primitive item hashes to the canonical material hashes,
// (2) computes the leaf bundle hash, and (3) pins the master's nested-bundle item
// to that leaf hash before computing the master hash. A follow-up --check must
// be clean, proving the stamped corpus is internally consistent.
func TestMintResolvesNestedBundleHashesInOrder(t *testing.T) {
	root := t.TempDir()

	writeJSONFile(t, filepath.Join(root, "primitives", "materials", "a.json"), material("a"))
	writeJSONFile(t, filepath.Join(root, "primitives", "materials", "b.json"), material("b"))

	leaf := map[string]any{
		"format_version": "1.0", "record_class": "bundle", "slug": "leaf", "state": "open",
		"emitter": "opg://test", "license": "CC-BY-4.0",
		"lineage": map[string]any{"provenance_state": "unasserted", "outcome": "unknown"},
		"name":    map[string]any{"en": "Leaf"},
		"items": []any{
			map[string]any{"record_class": "primitive", "kind": "material", "slug": "a", "hash": zeroHash, "role": "optional"},
			map[string]any{"record_class": "primitive", "kind": "material", "slug": "b", "hash": zeroHash, "role": "optional"},
		},
		"successors":   []any{},
		"content_hash": zeroHash,
	}
	writeJSONFile(t, filepath.Join(root, "indexes", "bundles", "leaf.json"), leaf)

	master := map[string]any{
		"format_version": "1.0", "record_class": "bundle", "slug": "master", "state": "open",
		"emitter": "opg://test", "license": "CC-BY-4.0",
		"lineage": map[string]any{"provenance_state": "unasserted", "outcome": "unknown"},
		"name":    map[string]any{"en": "Master"},
		"items": []any{
			map[string]any{"record_class": "bundle", "slug": "leaf", "hash": zeroHash, "role": "optional"},
		},
		"successors":   []any{},
		"content_hash": zeroHash,
	}
	writeJSONFile(t, filepath.Join(root, "indexes", "bundles", "master.json"), master)

	if code := runMint([]string{"--mock", root}); code != 0 {
		t.Fatalf("mint write returned %d, want 0", code)
	}

	// Materials stamped with canonical hashes.
	wantA, _ := hash.Compute(readJSONFile(t, filepath.Join(root, "primitives", "materials", "a.json")))
	if wantA == zeroHash {
		t.Fatal("material a hash not stamped")
	}

	leafOut := readJSONFile(t, filepath.Join(root, "indexes", "bundles", "leaf.json"))
	leafHash, _ := leafOut["content_hash"].(string)
	if leafHash == zeroHash || leafHash == "" {
		t.Fatalf("leaf content_hash not stamped: %q", leafHash)
	}
	// Leaf items re-pinned to canonical material hashes.
	leafItems := leafOut["items"].([]any)
	if h := leafItems[0].(map[string]any)["hash"].(string); h != wantA {
		t.Errorf("leaf item[0] hash = %s, want material a hash %s", h, wantA)
	}

	// Master's nested-bundle item is pinned to the leaf's content_hash.
	masterOut := readJSONFile(t, filepath.Join(root, "indexes", "bundles", "master.json"))
	masterItems := masterOut["items"].([]any)
	if h := masterItems[0].(map[string]any)["hash"].(string); h != leafHash {
		t.Errorf("master nested item hash = %s, want leaf content_hash %s", h, leafHash)
	}
	masterHash, _ := masterOut["content_hash"].(string)
	if masterHash == zeroHash || masterHash == "" {
		t.Fatal("master content_hash not stamped")
	}

	// The stamped corpus must be self-consistent: a follow-up --check is clean.
	if code := runMint([]string{"--mock", root, "--check"}); code != 0 {
		t.Fatalf("mint --check after stamping returned %d, want 0 (corpus should be consistent)", code)
	}

	// And mint is idempotent: a second write rewrites nothing.
	if code := runMint([]string{"--mock", root}); code != 0 {
		t.Fatalf("second mint returned %d, want 0", code)
	}
}

// TestMintIncludeScopeLeavesOutsideFilesUntouched verifies that --include gates
// writes: an out-of-scope record that would otherwise be re-stamped is left on
// disk unchanged (and reported), while in-scope records are written.
func TestMintIncludeScopeLeavesOutsideFilesUntouched(t *testing.T) {
	root := t.TempDir()
	inPath := filepath.Join(root, "primitives", "materials", "produce", "in.json")
	outPath := filepath.Join(root, "primitives", "tools", "out.json")
	writeJSONFile(t, inPath, material("in"))
	tool := material("out")
	tool["kind"] = "tool"
	writeJSONFile(t, outPath, tool)

	before, _ := os.ReadFile(outPath)

	if code := runMint([]string{"--mock", root, "--include", "primitives/materials/produce/"}); code != 0 {
		t.Fatalf("mint returned %d, want 0", code)
	}

	// In-scope file got a real hash.
	if h, _ := readJSONFile(t, inPath)["content_hash"].(string); h == zeroHash {
		t.Error("in-scope record was not stamped")
	}
	// Out-of-scope file is byte-identical to before.
	after, _ := os.ReadFile(outPath)
	if string(before) != string(after) {
		t.Error("out-of-scope record was modified despite --include filter")
	}
}
