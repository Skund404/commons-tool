// Package diff implements the Proto-Commons recommendation engine: given a
// semantic diff (added/modified/deleted records) plus the post-diff corpus
// state, emit a flat list of severity-ranked findings.
//
// Gate policy (locked spec proto-commons-tool-v1-spec, memory 2026-05-28):
//
//	REJECT  schema validation failures, hash drift, license mismatch,
//	        slug collision, cycle introduction, dangling cross-references,
//	        bundle item dangling, reserved-namespace claims, embedded media.
//	WARN    alias collision in resolve indexes (UI disambiguation needed),
//	        kind-mismatch heuristics, outside-primary-craft heuristics.
//	INFO    index regeneration needed, bundle cascade, new emitter first seen.
//	APPROVE all gates pass for a sub-domain (schema, hash, license).
package diff

import "encoding/json"

// Severity is one of approve / warn / reject / info.
type Severity string

const (
	SevApprove Severity = "approve"
	SevWarn    Severity = "warn"
	SevReject  Severity = "reject"
	SevInfo    Severity = "info"
)

// Recommendation matches the frontend's Recommendation interface 1:1 so the UI
// renders it without translation.
type Recommendation struct {
	Sev     Severity `json:"sev"`
	Title   string   `json:"title"`
	Body    string   `json:"body,omitempty"`
	File    string   `json:"file,omitempty"`
	Hash    string   `json:"hash,omitempty"`
	Suggest string   `json:"suggest,omitempty"`
}

// MarshalJSON ensures the sev field stays a plain string in wire JSON.
func (r Recommendation) MarshalJSON() ([]byte, error) {
	type alias struct {
		Sev     string `json:"sev"`
		Title   string `json:"title"`
		Body    string `json:"body,omitempty"`
		File    string `json:"file,omitempty"`
		Hash    string `json:"hash,omitempty"`
		Suggest string `json:"suggest,omitempty"`
	}
	return json.Marshal(alias{
		Sev: string(r.Sev), Title: r.Title, Body: r.Body,
		File: r.File, Hash: r.Hash, Suggest: r.Suggest,
	})
}

// RecommendSettings tunes the engine per-deployment. Defaults are sensible for
// the Rillmark primary commons; federation roots may override PrimaryCraft.
type RecommendSettings struct {
	// PrimaryCraft is the craft domain this commons is curated around. Used by
	// the outside-craft heuristic. Empty disables the check.
	PrimaryCraft string

	// PrimaryCraftKeywords are tag/category strings considered in-domain.
	// Used as a fallback when the heuristic cannot match exactly.
	PrimaryCraftKeywords []string

	// ReservedEmitterPrefixes (e.g. "opg://rillmark-") may only be claimed by
	// the maintainer. Contributions using these are REJECTed.
	ReservedEmitterPrefixes []string

	// KnownEmitters is the set of emitter URIs already in the corpus; the
	// recommender flags new ones with INFO.
	KnownEmitters map[string]bool
}

// DefaultSettings returns the conservative defaults the Rillmark primary uses.
func DefaultSettings() RecommendSettings {
	return RecommendSettings{
		PrimaryCraft: "leatherworking",
		PrimaryCraftKeywords: []string{
			"leather", "leatherworking", "veg-tan", "veg tan", "saddle",
			"awl", "stitch", "burnish", "skiving", "slicker", "edge",
		},
		ReservedEmitterPrefixes: []string{"opg://rillmark-"},
	}
}
