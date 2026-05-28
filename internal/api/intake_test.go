package api

import (
	"strings"
	"testing"
)

// Sample bodies — minimal but shape-correct so the detector decides.
const sampleSpec = `{
  "opgl_version": "0.6",
  "emitter": "opg://aaaa1111-bbbb-2222-cccc-333344445555",
  "id": "scratch-awl-001",
  "slug": "scratch-awl",
  "kind": "tool",
  "name": "Scratch Awl",
  "created": "2026-05-28",
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000123",
  "properties": {
    "license": "CC-BY-4.0",
    "names": { "en": ["scratch awl", "awl"] }
  },
  "lineage": { "provenance_state": "unasserted", "outcome": "unknown" }
}`

const sampleUI = `{
  "id": "stitching-chisel",
  "slug": "stitching-chisel",
  "kind": "tool",
  "name": "Stitching Chisel",
  "names": { "en": { "canonical": "stitching chisel", "aliases": ["pricking iron"] } },
  "license": "CC-BY-4.0",
  "rel": []
}`

func TestParseIntakeText_SingleObject(t *testing.T) {
	docs := parseIntakeText(sampleSpec)
	if len(docs) != 1 {
		t.Fatalf("want 1 doc, got %d", len(docs))
	}
	if docs[0].err != nil {
		t.Fatalf("parse err: %v", docs[0].err)
	}
	if detectShape(docs[0].doc) != "spec" {
		t.Errorf("expected shape=spec")
	}
}

func TestParseIntakeText_JSONArray(t *testing.T) {
	text := "[" + sampleSpec + "," + sampleUI + "]"
	docs := parseIntakeText(text)
	if len(docs) != 2 {
		t.Fatalf("want 2 docs, got %d", len(docs))
	}
	if detectShape(docs[0].doc) != "spec" {
		t.Errorf("docs[0]: want spec, got %s", detectShape(docs[0].doc))
	}
	if detectShape(docs[1].doc) != "ui" {
		t.Errorf("docs[1]: want ui, got %s", detectShape(docs[1].doc))
	}
}

func TestParseIntakeText_DashSeparated(t *testing.T) {
	text := sampleSpec + "\n---\n" + sampleUI
	docs := parseIntakeText(text)
	if len(docs) != 2 {
		t.Fatalf("want 2 docs, got %d", len(docs))
	}
	if docs[0].err != nil || docs[1].err != nil {
		t.Fatalf("parse err: %v / %v", docs[0].err, docs[1].err)
	}
}

func TestParseIntakeText_NDJSON(t *testing.T) {
	// NDJSON requires single-line per doc; compress samples.
	compact := func(s string) string {
		s = strings.ReplaceAll(s, "\n", "")
		s = strings.Join(strings.Fields(s), " ")
		return s
	}
	text := compact(sampleSpec) + "\n" + compact(sampleUI)
	docs := parseIntakeText(text)
	if len(docs) != 2 {
		t.Fatalf("want 2 docs, got %d (text len=%d)", len(docs), len(text))
	}
	if docs[0].err != nil || docs[1].err != nil {
		t.Fatalf("parse errs: %v / %v", docs[0].err, docs[1].err)
	}
}

func TestParseIntakeText_InvalidJSON(t *testing.T) {
	docs := parseIntakeText("{ not valid }")
	if len(docs) != 1 {
		t.Fatalf("want 1 doc, got %d", len(docs))
	}
	if docs[0].err == nil {
		t.Fatal("expected parse error")
	}
}

func TestDetectShape_Spec(t *testing.T) {
	doc := map[string]any{
		"opgl_version": "0.6",
		"slug":         "awl",
		"kind":         "tool",
	}
	if got := detectShape(doc); got != "spec" {
		t.Errorf("want spec, got %s", got)
	}
}

func TestDetectShape_UI(t *testing.T) {
	doc := map[string]any{
		"slug": "awl",
		"kind": "tool",
		"names": map[string]any{
			"en": map[string]any{"canonical": "awl", "aliases": []any{}},
		},
	}
	if got := detectShape(doc); got != "ui" {
		t.Errorf("want ui, got %s", got)
	}
}

func TestDetectShape_Unknown(t *testing.T) {
	doc := map[string]any{"random": "thing"}
	if got := detectShape(doc); got != "unknown" {
		t.Errorf("want unknown, got %s", got)
	}
}
