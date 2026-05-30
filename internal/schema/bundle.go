package schema

import (
	"fmt"
)

// Bundle is the on-disk shape of a Proto-Commons bundle per the OPG-L 0.6 Index
// & Bundle Data-Format Addendum 1.0 (§B).
type Bundle struct {
	FormatVersion string            `json:"format_version"`
	RecordClass   string            `json:"record_class"`
	Slug          string            `json:"slug"`            // living identity (open)
	State         string            `json:"state"`           // "open" | "closed"
	Emitter       string            `json:"emitter"`
	License       string            `json:"license"`
	Lineage       *Lineage          `json:"lineage,omitempty"`
	Name          map[string]string `json:"name,omitempty"`
	Description   map[string]string `json:"description,omitempty"`
	Items         []BundleItem      `json:"items"`
	Successors    []Successor       `json:"successors,omitempty"`
	ContentHash   string            `json:"content_hash"` // frozen identity (closed); excludes successors
	Modified      string            `json:"modified,omitempty"`
}

// BundleItem references either a primitive or a nested bundle.
//
// Note is an OPTIONAL localized ({lang: string}) authored annotation, consistent
// with name/description (addendum §B.3 — resolved per the 2026-05-30 decision to
// localize rather than carry a plain string). Tooling-opaque; not a resolver
// contract.
type BundleItem struct {
	RecordClass string            `json:"record_class"`
	Kind        string            `json:"kind,omitempty"`
	Slug        string            `json:"slug"`
	Hash        string            `json:"hash"`
	Role        string            `json:"role"`
	Note        map[string]string `json:"note,omitempty"`
}

// Successor is an append-only, hash-excluded forward pointer to a standalone
// successor bundle (addendum §B.6). It carries no role.
type Successor struct {
	Target       string            `json:"target"`                  // successor bundle by slug or hash
	Note         map[string]string `json:"note,omitempty"`          // localized explanation
	ChangeImpact string            `json:"change_impact,omitempty"` // OPEN vocabulary
	Added        string            `json:"added,omitempty"`
}

// ValidBundleRoles — closed set per addendum §B.3.
var ValidBundleRoles = map[string]bool{
	"required": true, "recommended": true, "optional": true,
}

// ValidBundleStates — closed set per addendum §B.5.
var ValidBundleStates = map[string]bool{
	"open": true, "closed": true,
}

// ValidateBundle runs all strict gates on a bundle record. Append-only checking
// of successors vs. a prior published state is stateful and lives at the
// intake/diff layer; this validator covers the structural rules.
func ValidateBundle(b *Bundle) []error {
	var errs []error
	add := func(format string, args ...any) {
		errs = append(errs, fmt.Errorf(format, args...))
	}

	if b.FormatVersion == "" {
		add("format_version: required")
	}
	if b.RecordClass != "bundle" {
		add("record_class: must be \"bundle\", got %q", b.RecordClass)
	}
	if b.Slug == "" {
		add("slug: required")
	} else if !slugRE.MatchString(b.Slug) {
		add("slug: %q must be kebab-case", b.Slug)
	}
	if !ValidBundleStates[b.State] {
		add("state: %q not in {open, closed}", b.State)
	}
	if b.Emitter == "" {
		add("emitter: required")
	} else if !uriRE.MatchString(b.Emitter) {
		add("emitter: %q does not match opg://<uuid>", b.Emitter)
	}
	if b.ContentHash == "" {
		add("content_hash: required")
	} else if !hashRE.MatchString(b.ContentHash) {
		add("content_hash: %q is not sha256:<64 hex>", b.ContentHash)
	}

	if len(b.Items) == 0 {
		add("items: bundle must contain at least one item")
	}
	for i, it := range b.Items {
		switch it.RecordClass {
		case "primitive":
			if !ValidKinds[it.Kind] {
				add("items[%d].kind: %q not in closed set", i, it.Kind)
			}
		case "bundle":
			// Nested bundle — kind is informational only.
		case "":
			add("items[%d].record_class: required (\"primitive\" or \"bundle\")", i)
		default:
			add("items[%d].record_class: %q not recognized", i, it.RecordClass)
		}
		if it.Slug == "" {
			add("items[%d].slug: required", i)
		}
		if !hashRE.MatchString(it.Hash) {
			add("items[%d].hash: %q is not sha256:<64 hex>", i, it.Hash)
		}
		if !ValidBundleRoles[it.Role] {
			add("items[%d].role: %q not in {required, recommended, optional}", i, it.Role)
		}
	}

	for i, sc := range b.Successors {
		if sc.Target == "" {
			add("successors[%d].target: required", i)
		}
	}

	if b.Lineage != nil {
		if b.Lineage.ProvenanceState != "" && !ValidProvenanceStates[b.Lineage.ProvenanceState] {
			add("lineage.provenance_state: %q not in closed set", b.Lineage.ProvenanceState)
		}
		if b.Lineage.Outcome != "" && !ValidOutcomes[b.Lineage.Outcome] {
			add("lineage.outcome: %q not in closed set", b.Lineage.Outcome)
		}
	}

	return errs
}
