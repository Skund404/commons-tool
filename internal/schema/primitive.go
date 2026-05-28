// Package schema validates OPG-L 0.6 primitives and Proto-Commons bundles.
//
// The validator is intentionally focused on the rules that matter for the
// commons mock corpus and live maintainer use — closed enums, required fields,
// hash format, slug format, relationship integrity. It does NOT implement the
// full breadth of the OPG-L spec (timing discipline §4.4, amendments §4.5,
// every kind-specific property invariant), which the reference implementation
// in opg-core covers.
package schema

import (
	"fmt"
	"regexp"
	"strings"
)

// Primitive matches the on-disk shape of a Proto-Commons primitive record per
// _Proto-Commons/mock/. Use map[string]any rather than this struct when you
// need to preserve unknown fields for hashing.
type Primitive struct {
	OPGLVersion  string                 `json:"opgl_version"`
	Emitter      string                 `json:"emitter"`
	ID           string                 `json:"id"`
	Slug         string                 `json:"slug"`
	Kind         string                 `json:"kind"`
	Name         string                 `json:"name"`
	Description  string                 `json:"description,omitempty"`
	Visibility   string                 `json:"visibility,omitempty"`
	Created      string                 `json:"created"`
	Modified     string                 `json:"modified,omitempty"`
	ContentHash  string                 `json:"content_hash"`
	Tags         []string               `json:"tags,omitempty"`
	Properties   map[string]any         `json:"properties,omitempty"`
	Relationships []Relationship        `json:"relationships,omitempty"`
	Lineage      *Lineage               `json:"lineage,omitempty"`
}

// Lineage block per OPG-L §4.4.
type Lineage struct {
	ProvenanceState string `json:"provenance_state"`
	Outcome         string `json:"outcome"`
}

// Relationship references a target primitive by id + hash + path.
type Relationship struct {
	Type   string         `json:"type"`
	Target Reference      `json:"target"`
	Props  map[string]any `json:"properties,omitempty"`
}

type Reference struct {
	ID   string `json:"id"`
	Hash string `json:"hash"`
	Path string `json:"path,omitempty"`
}

// ValidKinds — the closed set per OPG-L §3.
var ValidKinds = map[string]bool{
	"tool": true, "material": true, "technique": true,
	"workflow": true, "project": true, "event": true,
}

// ValidProvenanceStates — closed set per OPG-L §4.2.
var ValidProvenanceStates = map[string]bool{
	"unasserted": true, "asserted": true, "unknown": true, "external": true,
}

// ValidOutcomes — closed set per OPG-L §4.3.
var ValidOutcomes = map[string]bool{
	"succeeded": true, "failed": true, "partial": true,
	"aborted": true, "superseded": true, "unknown": true,
}

// ValidRelationshipTypes — closed set per OPG-L §3 + Proto-Commons spec.
var ValidRelationshipTypes = map[string]bool{
	"specializes": true, "predecessor": true, "derived_from": true,
	"composed_of": true, "uses_tool": true, "uses_material": true,
	"applies_technique": true, "produces": true, "consumes": true,
}

// MinOPGLVersion is the floor per §15.8. Records with an earlier version
// are rejected by 0.6 validators.
const MinOPGLVersion = "0.6"

var (
	slugRE = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)
	hashRE = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	dateRE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	uriRE  = regexp.MustCompile(`^opg://[A-Za-z0-9._\-]+$`)
)

// ValidatePrimitive runs all strict gates on a primitive record. Returns a
// flat list of validation errors; nil means clean.
func ValidatePrimitive(p *Primitive) []error {
	var errs []error
	add := func(format string, args ...any) {
		errs = append(errs, fmt.Errorf(format, args...))
	}

	if p.OPGLVersion == "" {
		add("opgl_version: required")
	} else if p.OPGLVersion < MinOPGLVersion {
		add("opgl_version: %q below floor %q (§15.8)", p.OPGLVersion, MinOPGLVersion)
	}

	if p.Emitter == "" {
		add("emitter: required")
	} else if !uriRE.MatchString(p.Emitter) {
		add("emitter: %q does not match opg://<uuid>", p.Emitter)
	}

	if p.ID == "" {
		add("id: required")
	}

	if p.Slug == "" {
		add("slug: required")
	} else if !slugRE.MatchString(p.Slug) {
		add("slug: %q must be kebab-case", p.Slug)
	}

	if p.Kind == "" {
		add("kind: required")
	} else if !ValidKinds[p.Kind] {
		add("kind: %q not in closed set %v", p.Kind, sortedKeys(ValidKinds))
	}

	if p.Name == "" {
		add("name: required")
	}

	if p.Created == "" {
		add("created: required")
	} else if !dateRE.MatchString(p.Created) {
		add("created: %q is not YYYY-MM-DD", p.Created)
	}

	if p.Modified != "" && !dateRE.MatchString(p.Modified) {
		add("modified: %q is not YYYY-MM-DD", p.Modified)
	}

	if p.ContentHash == "" {
		add("content_hash: required")
	} else if !hashRE.MatchString(p.ContentHash) {
		add("content_hash: %q is not sha256:<64 hex>", p.ContentHash)
	}

	// Properties.names: map[lang][]string, first entry is canonical.
	if p.Properties != nil {
		if names, ok := p.Properties["names"]; ok {
			if m, isMap := names.(map[string]any); isMap {
				for lang, list := range m {
					arr, isArr := list.([]any)
					if !isArr {
						add("properties.names.%s: must be array of strings", lang)
						continue
					}
					if len(arr) == 0 {
						add("properties.names.%s: empty (canonical name required)", lang)
					}
					for i, v := range arr {
						if _, isStr := v.(string); !isStr {
							add("properties.names.%s[%d]: not a string", lang, i)
						}
					}
				}
			} else {
				add("properties.names: must be object {lang: [name, ...]}")
			}
		}
		if lic, ok := p.Properties["license"]; ok {
			if s, isStr := lic.(string); isStr {
				if !strings.HasPrefix(s, "CC-") &&
					!strings.HasPrefix(s, "MIT") &&
					!strings.HasPrefix(s, "Apache") &&
					!strings.HasPrefix(s, "CDLA") &&
					s != "" {
					add("properties.license: %q not a recognized identifier", s)
				}
			}
		}
	}

	for i, rel := range p.Relationships {
		if !ValidRelationshipTypes[rel.Type] {
			add("relationships[%d].type: %q not recognized", i, rel.Type)
		}
		if rel.Target.ID == "" {
			add("relationships[%d].target.id: required", i)
		}
		if !hashRE.MatchString(rel.Target.Hash) {
			add("relationships[%d].target.hash: %q is not sha256:<64 hex>", i, rel.Target.Hash)
		}
	}

	if p.Lineage != nil {
		if p.Lineage.ProvenanceState != "" && !ValidProvenanceStates[p.Lineage.ProvenanceState] {
			add("lineage.provenance_state: %q not in closed set", p.Lineage.ProvenanceState)
		}
		if p.Lineage.Outcome != "" && !ValidOutcomes[p.Lineage.Outcome] {
			add("lineage.outcome: %q not in closed set", p.Lineage.Outcome)
		}
	}

	return errs
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	// Stable order for error messages.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1] > out[j]; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}
