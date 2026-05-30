package schema

import (
	"fmt"
)

// Bundle is the on-disk shape of a Proto-Commons bundle per
// _Processes/proto-commons-index-spec.md §5.
type Bundle struct {
	RecordClass string             `json:"record_class"`
	Slug        string             `json:"slug"`
	Emitter     string             `json:"emitter"`
	ContentHash string             `json:"content_hash"`
	License     string             `json:"license"`
	Lineage     *Lineage           `json:"lineage,omitempty"`
	Name        map[string]string  `json:"name,omitempty"`
	Description map[string]string  `json:"description,omitempty"`
	Items       []BundleItem       `json:"items"`
}

// BundleItem references either a primitive or a nested bundle.
//
// Note is an OPTIONAL free-text annotation carried from the authoring shape
// (HideSync's per-item note) so it survives canonical intake rather than being
// dropped — see OPG-L Handbook DEFERRED-SPEC-QUESTIONS Q-005. Descriptive only;
// not a resolver contract.
type BundleItem struct {
	RecordClass string `json:"record_class"`
	Kind        string `json:"kind,omitempty"`
	Slug        string `json:"slug"`
	Hash        string `json:"hash"`
	Role        string `json:"role"`
	Note        string `json:"note,omitempty"`
}

// ValidBundleRoles — closed set per spec §5.3.
var ValidBundleRoles = map[string]bool{
	"required": true, "recommended": true, "optional": true,
}

// ValidateBundle runs all strict gates on a bundle record.
func ValidateBundle(b *Bundle) []error {
	var errs []error
	add := func(format string, args ...any) {
		errs = append(errs, fmt.Errorf(format, args...))
	}

	if b.RecordClass != "bundle" {
		add("record_class: must be \"bundle\", got %q", b.RecordClass)
	}
	if b.Slug == "" {
		add("slug: required")
	} else if !slugRE.MatchString(b.Slug) {
		add("slug: %q must be kebab-case", b.Slug)
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
