package schema

import "testing"

// validBundle returns a bundle that passes every gate.
func validBundle() *Bundle {
	return &Bundle{
		RecordClass: "bundle",
		Slug:        "egg-kit",
		Emitter:     "opg://commons-seed",
		ContentHash: goodHash,
		License:     "CC-BY-4.0",
		Name:        map[string]string{"en": "Egg kit"},
		Description: map[string]string{"en": "A tiny kit."},
		Items: []BundleItem{
			{RecordClass: "primitive", Kind: "material", Slug: "egg", Hash: goodHash, Role: "required", Note: "the egg"},
		},
	}
}

func TestValidateBundle(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(*Bundle)
		wantErr bool
		substr  string
	}{
		{"valid", func(*Bundle) {}, false, ""},
		{"bad record_class", func(b *Bundle) { b.RecordClass = "primitive" }, true, "record_class"},
		{"missing slug", func(b *Bundle) { b.Slug = "" }, true, "slug: required"},
		{"bad slug", func(b *Bundle) { b.Slug = "Not Kebab" }, true, "kebab"},
		{"missing emitter", func(b *Bundle) { b.Emitter = "" }, true, "emitter: required"},
		{"bad emitter", func(b *Bundle) { b.Emitter = "ftp://x" }, true, "opg://"},
		{"missing hash", func(b *Bundle) { b.ContentHash = "" }, true, "content_hash"},
		{"bad hash", func(b *Bundle) { b.ContentHash = "deadbeef" }, true, "64 hex"},
		{"empty items", func(b *Bundle) { b.Items = nil }, true, "at least one item"},
		{"item missing record_class", func(b *Bundle) { b.Items[0].RecordClass = "" }, true, "record_class: required"},
		{"item bad record_class", func(b *Bundle) { b.Items[0].RecordClass = "widget" }, true, "not recognized"},
		{"item bad kind", func(b *Bundle) { b.Items[0].Kind = "sauce" }, true, "not in closed set"},
		{"item missing slug", func(b *Bundle) { b.Items[0].Slug = "" }, true, "slug: required"},
		{"item bad hash", func(b *Bundle) { b.Items[0].Hash = "nope" }, true, "64 hex"},
		{"item bad role", func(b *Bundle) { b.Items[0].Role = "mandatory" }, true, "role"},
		{"nested bundle item ok", func(b *Bundle) {
			b.Items[0] = BundleItem{RecordClass: "bundle", Slug: "sub-kit", Hash: goodHash, Role: "optional"}
		}, false, ""},
		{"note is optional, preserved", func(b *Bundle) { b.Items[0].Note = "" }, false, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			b := validBundle()
			c.mutate(b)
			errs := ValidateBundle(b)
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
