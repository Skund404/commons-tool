package schema

import (
	"strings"
	"testing"
)

const goodHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

// validPrim returns a primitive that passes every gate. Each call builds fresh
// maps so a per-case mutator can't bleed into another case.
func validPrim() *Primitive {
	return &Primitive{
		OPGLVersion: "0.6",
		Emitter:     "opg://commons-seed",
		ID:          "egg-x",
		Slug:        "egg",
		Kind:        "material",
		Name:        "Egg",
		Created:     "2026-05-30",
		Modified:    "2026-05-30",
		ContentHash: goodHash,
		Tags:        []string{"egg"},
		Properties: map[string]any{
			"license": "CC-BY-4.0",
			"names":   map[string]any{"en": []any{"egg"}},
		},
		Lineage: &Lineage{ProvenanceState: "unasserted", Outcome: "unknown"},
	}
}

func containsErr(errs []error, substr string) bool {
	for _, e := range errs {
		if strings.Contains(e.Error(), substr) {
			return true
		}
	}
	return false
}

func TestValidatePrimitive(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(*Primitive)
		wantErr bool
		substr  string
	}{
		{"valid", func(*Primitive) {}, false, ""},
		{"missing opgl_version", func(p *Primitive) { p.OPGLVersion = "" }, true, "opgl_version"},
		{"below floor", func(p *Primitive) { p.OPGLVersion = "0.5" }, true, "below floor"},
		{"missing emitter", func(p *Primitive) { p.Emitter = "" }, true, "emitter"},
		{"bad emitter", func(p *Primitive) { p.Emitter = "https://x" }, true, "opg://"},
		{"missing id", func(p *Primitive) { p.ID = "" }, true, "id: required"},
		{"missing slug", func(p *Primitive) { p.Slug = "" }, true, "slug: required"},
		{"bad slug", func(p *Primitive) { p.Slug = "Not Kebab" }, true, "kebab"},
		{"missing kind", func(p *Primitive) { p.Kind = "" }, true, "kind: required"},
		{"bad kind", func(p *Primitive) { p.Kind = "sauce" }, true, "closed set"},
		{"missing name", func(p *Primitive) { p.Name = "" }, true, "name: required"},
		{"missing created", func(p *Primitive) { p.Created = "" }, true, "created: required"},
		{"bad created", func(p *Primitive) { p.Created = "2026/05/30" }, true, "YYYY-MM-DD"},
		{"bad modified", func(p *Primitive) { p.Modified = "nope" }, true, "modified"},
		{"missing hash", func(p *Primitive) { p.ContentHash = "" }, true, "content_hash: required"},
		{"bad hash", func(p *Primitive) { p.ContentHash = "sha256:zz" }, true, "64 hex"},
		{"names not array", func(p *Primitive) { p.Properties["names"] = map[string]any{"en": "egg"} }, true, "array of strings"},
		{"names empty", func(p *Primitive) { p.Properties["names"] = map[string]any{"en": []any{}} }, true, "empty"},
		{"names not object", func(p *Primitive) { p.Properties["names"] = "egg" }, true, "must be object"},
		{"bad license", func(p *Primitive) { p.Properties["license"] = "WTFPL" }, true, "not a recognized"},
		{"good MIT license", func(p *Primitive) { p.Properties["license"] = "MIT" }, false, ""},
		{"bad rel type", func(p *Primitive) {
			p.Relationships = []Relationship{{Type: "frobnicates", Target: Reference{ID: "x", Hash: goodHash}}}
		}, true, "not recognized"},
		{"rel missing target id", func(p *Primitive) {
			p.Relationships = []Relationship{{Type: "uses_tool", Target: Reference{Hash: goodHash}}}
		}, true, "target.id"},
		{"rel bad target hash", func(p *Primitive) {
			p.Relationships = []Relationship{{Type: "uses_tool", Target: Reference{ID: "x", Hash: "nope"}}}
		}, true, "64 hex"},
		{"good relationship", func(p *Primitive) {
			p.Relationships = []Relationship{{Type: "uses_tool", Target: Reference{ID: "x", Hash: goodHash}}}
		}, false, ""},
		{"bad provenance", func(p *Primitive) { p.Lineage.ProvenanceState = "maybe" }, true, "provenance_state"},
		{"bad outcome", func(p *Primitive) { p.Lineage.Outcome = "dunno" }, true, "outcome"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := validPrim()
			c.mutate(p)
			errs := ValidatePrimitive(p)
			if c.wantErr && len(errs) == 0 {
				t.Fatalf("expected an error, got clean")
			}
			if !c.wantErr && len(errs) != 0 {
				t.Fatalf("expected clean, got %v", errs)
			}
			if c.substr != "" && !containsErr(errs, c.substr) {
				t.Errorf("want an error containing %q, got %v", c.substr, errs)
			}
		})
	}
}
