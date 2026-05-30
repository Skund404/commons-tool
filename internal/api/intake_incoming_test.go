package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	hashEgg   = "sha256:" + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	hashWhisk = "sha256:" + "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
)

func mustReadJSON(t *testing.T, path string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return m
}

func TestIntakeIncoming_ExplodesClosureAndBundle(t *testing.T) {
	root := t.TempDir()
	incomingDir := filepath.Join(root, "contributions", "incoming")
	if err := os.MkdirAll(incomingDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// One file: an authoring-shape bundle (nested target + per-item note) plus
	// its two member primitives in canonical commons wire shape.
	ship := `[
      {
        "record_class":"bundle","opgl_version":"0.6","id":"egg-kit-x","slug":"egg-kit",
        "name":"Egg kit","description":"A tiny kit.","visibility":"commons",
        "properties":{"license":"CC-BY-4.0","names":{"en":["Egg kit"],"de":["Eier-Set"]}},
        "items":[
          {"role":"required","note":"the egg","target":{"id":"egg-x","hash":"` + hashEgg + `","path":"primitives/materials/egg.json"}},
          {"role":"recommended","target":{"id":"whisk-x","hash":"` + hashWhisk + `","path":"primitives/tools/whisk.json"}}
        ]
      },
      {
        "opgl_version":"0.6","emitter":"opg://commons-seed","id":"egg-x","slug":"egg","kind":"material",
        "name":"Egg","created":"2026-05-30","content_hash":"` + hashEgg + `",
        "properties":{"license":"CC-BY-4.0","names":{"en":["egg"]}},
        "lineage":{"provenance_state":"unasserted","outcome":"unknown"}
      },
      {
        "opgl_version":"0.6","emitter":"opg://commons-seed","id":"whisk-x","slug":"whisk","kind":"tool",
        "name":"Whisk","created":"2026-05-30","content_hash":"` + hashWhisk + `",
        "properties":{"license":"CC-BY-4.0","names":{"en":["whisk"]}},
        "lineage":{"provenance_state":"unasserted","outcome":"unknown"}
      }
    ]`
	shipPath := filepath.Join(incomingDir, "egg-kit.json")
	if err := os.WriteFile(shipPath, []byte(ship), 0o644); err != nil {
		t.Fatal(err)
	}

	// Dry run first: no writes.
	dry, err := IntakeIncoming(root, []string{shipPath}, false, "opg://commons-seed")
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if len(dry[0].Errors) != 0 {
		t.Fatalf("dry run errors: %v", dry[0].Errors)
	}
	if _, statErr := os.Stat(filepath.Join(root, "primitives", "materials", "egg.json")); !os.IsNotExist(statErr) {
		t.Fatal("dry run should not write files")
	}

	// Apply.
	reports, err := IntakeIncoming(root, []string{shipPath}, true, "opg://commons-seed")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	r := reports[0]
	if len(r.Errors) != 0 {
		t.Fatalf("apply errors: %v", r.Errors)
	}
	if len(r.PrimitivesCreated) != 2 {
		t.Fatalf("want 2 primitives created, got %v", r.PrimitivesCreated)
	}
	if len(r.Bundles) != 1 || r.Bundles[0] != "egg-kit" {
		t.Fatalf("want bundle egg-kit, got %v", r.Bundles)
	}

	// Canonical primitive files exist at the plural-kind paths.
	for _, p := range []string{"primitives/materials/egg.json", "primitives/tools/whisk.json"} {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(p))); err != nil {
			t.Errorf("expected %s: %v", p, err)
		}
	}

	// Bundle mapped to canonical schema.Bundle shape with the note preserved.
	bundle := mustReadJSON(t, filepath.Join(root, "indexes", "bundles", "egg-kit.json"))
	if bundle["record_class"] != "bundle" {
		t.Errorf("bundle record_class = %v", bundle["record_class"])
	}
	if _, ok := bundle["name"].(map[string]any); !ok {
		t.Errorf("bundle name should be a per-language map, got %T", bundle["name"])
	}
	if ch, _ := bundle["content_hash"].(string); !strings.HasPrefix(ch, "sha256:") {
		t.Errorf("bundle content_hash not recomputed: %q", ch)
	}
	items, _ := bundle["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("want 2 bundle items, got %d", len(items))
	}
	first, _ := items[0].(map[string]any)
	if first["record_class"] != "primitive" || first["kind"] != "material" || first["slug"] != "egg" {
		t.Errorf("item[0] not canonicalized: %v", first)
	}
	// note is localized into {lang: string} (canonicalized from the authoring
	// plain string on the "en" key per the 2026-05-30 localize-the-code decision).
	noteMap, _ := first["note"].(map[string]any)
	if noteMap["en"] != "the egg" {
		t.Errorf("item[0] note not preserved/localized: %v", first["note"])
	}
	if first["hash"] != hashEgg {
		t.Errorf("item[0] hash = %v, want %s", first["hash"], hashEgg)
	}

	// Indexes regenerated.
	if _, err := os.Stat(filepath.Join(root, "indexes", "resolve", "en.json")); err != nil {
		t.Errorf("resolve index not regenerated: %v", err)
	}

	// Staged file removed on apply.
	if _, statErr := os.Stat(shipPath); !os.IsNotExist(statErr) {
		t.Error("staged incoming file should be removed after apply")
	}

	// The mapped bundle passes the strict bundle validator.
	if verrs := validateBundleDoc(bundle); len(verrs) != 0 {
		t.Errorf("canonical bundle failed validation: %v", verrs)
	}
}
