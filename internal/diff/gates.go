package diff

import (
	"encoding/json"
	"fmt"
	"strings"

	commonsgit "github.com/Skund404/commons-tool/internal/git"
	"github.com/Skund404/commons-tool/internal/hash"
	"github.com/Skund404/commons-tool/internal/indexer"
	"github.com/Skund404/commons-tool/internal/schema"
)

// gateSchema runs the strict primitive/bundle validator against the post-diff
// document and emits REJECT for any error, APPROVE when clean.
func gateSchema(sc *commonsgit.SemanticChange) []Recommendation {
	if sc.Op == commonsgit.OpDeleted {
		return nil
	}
	doc := sc.After
	if doc == nil {
		return nil
	}
	if sc.Class == commonsgit.ClassPrimitive {
		var p schema.Primitive
		raw, _ := json.Marshal(doc)
		if err := json.Unmarshal(raw, &p); err != nil {
			return []Recommendation{{
				Sev:   SevReject,
				Title: "Schema parse failure",
				Body:  fmt.Sprintf("Could not parse the primitive JSON: %v", err),
				File:  sc.Path,
			}}
		}
		errs := schema.ValidatePrimitive(&p)
		if len(errs) == 0 {
			return []Recommendation{{
				Sev:   SevApprove,
				Title: "Schema validates",
				Body:  "JSON schema for primitive/" + p.Kind + " passes. All required fields present.",
				File:  sc.Path,
			}}
		}
		out := make([]Recommendation, 0, len(errs))
		for _, e := range errs {
			out = append(out, Recommendation{
				Sev:   SevReject,
				Title: "Schema rejection: " + firstLine(e.Error()),
				Body:  e.Error(),
				File:  sc.Path,
			})
		}
		return out
	}

	if sc.Class == commonsgit.ClassBundle {
		var b schema.Bundle
		raw, _ := json.Marshal(doc)
		if err := json.Unmarshal(raw, &b); err != nil {
			return []Recommendation{{
				Sev:   SevReject,
				Title: "Bundle schema parse failure",
				Body:  err.Error(),
				File:  sc.Path,
			}}
		}
		errs := schema.ValidateBundle(&b)
		if len(errs) == 0 {
			return []Recommendation{{
				Sev:   SevApprove,
				Title: "Bundle schema validates",
				File:  sc.Path,
			}}
		}
		out := make([]Recommendation, 0, len(errs))
		for _, e := range errs {
			out = append(out, Recommendation{
				Sev:   SevReject,
				Title: "Bundle schema rejection: " + firstLine(e.Error()),
				Body:  e.Error(),
				File:  sc.Path,
			})
		}
		return out
	}
	return nil
}

// gateHash recomputes the canonical hash of the post-diff document (sans
// transient fields) and verifies the manifest's content_hash matches.
func gateHash(sc *commonsgit.SemanticChange) []Recommendation {
	if sc.Op == commonsgit.OpDeleted {
		return nil
	}
	doc := sc.After
	if doc == nil {
		return nil
	}
	claimed, _ := doc["content_hash"].(string)
	computed, err := hash.Compute(doc)
	if err != nil {
		return []Recommendation{{
			Sev:   SevReject,
			Title: "Hash computation failed",
			Body:  err.Error(),
			File:  sc.Path,
		}}
	}
	if claimed == "" {
		return []Recommendation{{
			Sev:   SevReject,
			Title: "content_hash missing",
			Body:  "Record has no content_hash. Run the canonicalizer locally and commit the result.",
			File:  sc.Path,
			Hash:  shortHash(computed),
		}}
	}
	if claimed != computed {
		return []Recommendation{{
			Sev:   SevReject,
			Title: "Hash drift: manifest does not match canonical body",
			Body:  fmt.Sprintf("Claimed: %s\nComputed: %s\nRecanonicalize and re-commit.", shortHash(claimed), shortHash(computed)),
			File:  sc.Path,
			Hash:  shortHash(computed),
		}}
	}
	return []Recommendation{{
		Sev:   SevApprove,
		Title: "Hash integrity OK",
		Body:  "Computed hash matches manifest. Content-addressed payload verified.",
		File:  sc.Path,
		Hash:  shortHash(computed),
	}}
}

// gateLicense checks license fields. The Proto-Commons MUST be CC-BY-4.0
// (locked 2026-05-28). Other identifiers are REJECTed.
func gateLicense(sc *commonsgit.SemanticChange) []Recommendation {
	if sc.Op == commonsgit.OpDeleted {
		return nil
	}
	doc := sc.After
	if doc == nil {
		return nil
	}
	lic := ""
	if sc.Class == commonsgit.ClassPrimitive {
		props, _ := doc["properties"].(map[string]any)
		lic, _ = props["license"].(string)
	} else if sc.Class == commonsgit.ClassBundle {
		lic, _ = doc["license"].(string)
	}
	if lic == "" {
		return []Recommendation{{
			Sev:   SevReject,
			Title: "License missing",
			Body:  "Proto-Commons records must declare license = CC-BY-4.0.",
			File:  sc.Path,
		}}
	}
	if lic != "CC-BY-4.0" {
		return []Recommendation{{
			Sev:   SevReject,
			Title: "License mismatch: " + lic,
			Body:  fmt.Sprintf("Proto-Commons policy is CC-BY-4.0 only (locked 2026-05-28). Got %q.", lic),
			File:  sc.Path,
		}}
	}
	return []Recommendation{{
		Sev:   SevApprove,
		Title: "License = CC-BY-4.0",
		Body:  "License field present and matches commons policy.",
	}}
}

// gateSlugCollision detects two added primitives reaching for the same slug,
// or a new primitive whose slug already exists in the corpus.
func gateSlugCollision(sc *commonsgit.SemanticChange, corpus []indexer.Item) []Recommendation {
	if sc.Op != commonsgit.OpAdded || sc.After == nil {
		return nil
	}
	mine, _ := sc.After["slug"].(string)
	if mine == "" {
		return nil
	}
	for _, it := range corpus {
		s, _ := it.Doc["slug"].(string)
		// Skip self — if this PR's added file was already merged into corpus
		// (defensive, not the usual case).
		if it.Path == sc.Path {
			continue
		}
		if s == mine {
			return []Recommendation{{
				Sev:   SevReject,
				Title: "Slug collision: " + mine,
				Body:  fmt.Sprintf("Slug %q is already used by %s. Each primitive needs a globally unique slug.", mine, it.Path),
				File:  sc.Path,
				Suggest: "Choose a more specific slug (e.g. include the manufacturer or material).",
			}}
		}
	}
	return nil
}

// gateCycle catches new specializes-edges that introduce a real cycle. The
// "parent not in corpus" condition is handled by gateDanglingRefs — we only
// emit here when the cycle detector flags an actual cycle.
func gateCycle(sc *commonsgit.SemanticChange, corpus []indexer.Item, postState postState) []Recommendation {
	if sc.After == nil {
		return nil
	}
	// Synthesize the post-diff corpus by overlaying every added/modified record.
	postIdx := map[string]indexer.Item{}
	for _, it := range corpus {
		h, _ := it.Doc["content_hash"].(string)
		postIdx[h] = it
	}
	for h, it := range postState.byHash {
		postIdx[h] = it
	}
	overlay := make([]indexer.Item, 0, len(postIdx))
	for _, v := range postIdx {
		overlay = append(overlay, v)
	}
	cycErrs := indexer.DetectCycles(overlay)
	if len(cycErrs) == 0 {
		return nil
	}
	var out []Recommendation
	for _, e := range cycErrs {
		if !strings.Contains(e, "cycle") {
			// "specializes-parent X not in corpus" → handled by dangling gate.
			continue
		}
		out = append(out, Recommendation{
			Sev:   SevReject,
			Title: "Specializes cycle introduced",
			Body:  e,
			File:  sc.Path,
		})
	}
	return out
}

// gateDanglingRefs catches relationships pointing at hashes not in the post-
// diff corpus. The post-diff corpus = existing corpus + every added primitive
// across the whole PR (so a PR that adds both parent and child in one go
// doesn't get falsely flagged).
func gateDanglingRefs(sc *commonsgit.SemanticChange, corpus []indexer.Item, postState postState) []Recommendation {
	if sc.After == nil {
		return nil
	}
	rels, _ := sc.After["relationships"].([]any)
	if len(rels) == 0 {
		return nil
	}
	known := map[string]bool{}
	for _, it := range corpus {
		if h, _ := it.Doc["content_hash"].(string); h != "" {
			known[h] = true
		}
	}
	for h := range postState.byHash {
		known[h] = true
	}
	var out []Recommendation
	for i, r := range rels {
		rel, _ := r.(map[string]any)
		t, _ := rel["target"].(map[string]any)
		if t == nil {
			continue
		}
		h, _ := t["hash"].(string)
		if h == "" || known[h] {
			continue
		}
		rt, _ := rel["type"].(string)
		out = append(out, Recommendation{
			Sev:     SevReject,
			Title:   "Dangling cross-reference: " + rt,
			Body:    fmt.Sprintf("relationships[%d].target.hash %s is not present in the post-merge corpus.", i, shortHash(h)),
			File:    sc.Path,
			Hash:    shortHash(h),
			Suggest: "Either land the target primitive first, or drop this relationship.",
		})
	}
	return out
}

// postState is the diff-wide projection passed to gates that need full
// visibility into what the PR will add.
type postState struct {
	byHash map[string]indexer.Item // every added/modified record keyed by content_hash
}

func buildPostState(diff *commonsgit.SemanticDiff) postState {
	ps := postState{byHash: map[string]indexer.Item{}}
	if diff == nil {
		return ps
	}
	for _, c := range diff.Changes {
		if c.Op == commonsgit.OpDeleted || c.After == nil {
			continue
		}
		h, _ := c.After["content_hash"].(string)
		if h == "" {
			continue
		}
		ps.byHash[h] = indexer.Item{Path: c.Path, Doc: c.After}
	}
	return ps
}

// gateBundleItems catches bundle items pinning hashes not in the corpus.
func gateBundleItems(sc *commonsgit.SemanticChange, corpus []indexer.Item) []Recommendation {
	if sc.Class != commonsgit.ClassBundle || sc.After == nil {
		return nil
	}
	known := map[string]bool{}
	for _, it := range corpus {
		if h, _ := it.Doc["content_hash"].(string); h != "" {
			known[h] = true
		}
	}
	items, _ := sc.After["items"].([]any)
	var out []Recommendation
	for i, raw := range items {
		it, _ := raw.(map[string]any)
		cls, _ := it["record_class"].(string)
		if cls != "primitive" {
			continue
		}
		h, _ := it["hash"].(string)
		if h == "" || known[h] {
			continue
		}
		slug, _ := it["slug"].(string)
		out = append(out, Recommendation{
			Sev:   SevReject,
			Title: "Bundle item pins unknown hash",
			Body:  fmt.Sprintf("items[%d] (slug %s) points at %s which is not in the corpus.", i, slug, shortHash(h)),
			File:  sc.Path,
		})
	}
	return out
}

// gateReservedNamespace REJECTs PRs claiming reserved emitter prefixes.
func gateReservedNamespace(sc *commonsgit.SemanticChange, settings RecommendSettings) []Recommendation {
	if sc.After == nil {
		return nil
	}
	emitter, _ := sc.After["emitter"].(string)
	if emitter == "" {
		return nil
	}
	for _, p := range settings.ReservedEmitterPrefixes {
		if strings.HasPrefix(emitter, p) {
			return []Recommendation{{
				Sev:   SevReject,
				Title: "Reserved emitter namespace",
				Body:  fmt.Sprintf("Emitter %q claims the reserved %q prefix.", emitter, p),
				File:  sc.Path,
				Suggest: "Use your own opg://<uuid> emitter URI; the maintainer-only prefixes are protected.",
			}}
		}
	}
	return nil
}

// gateMedia rejects records carrying embedded media (storage_mode = copy|link).
// Proto-Commons admits OPG-L primitives + URL-only media refs (locked 2026-05-28).
func gateMedia(sc *commonsgit.SemanticChange) []Recommendation {
	if sc.After == nil {
		return nil
	}
	media, _ := sc.After["media"].([]any)
	if len(media) == 0 {
		// Also check inside properties.media for legacy authoring.
		props, _ := sc.After["properties"].(map[string]any)
		media, _ = props["media"].([]any)
	}
	var out []Recommendation
	for i, raw := range media {
		m, _ := raw.(map[string]any)
		mode, _ := m["storage_mode"].(string)
		if mode == "copy" || mode == "link" {
			out = append(out, Recommendation{
				Sev:   SevReject,
				Title: "Embedded media not allowed in Proto-Commons",
				Body:  fmt.Sprintf("media[%d].storage_mode is %q. Proto-Commons admits URL-only media refs (locked 2026-05-28).", i, mode),
				File:  sc.Path,
				Suggest: "Replace with a URL reference, or hold this primitive back until the full Foundation commons reopens embedded media.",
			})
		}
	}
	return out
}

// ─────────── helpers ───────────

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	if len(s) > 80 {
		return s[:77] + "..."
	}
	return s
}

func shortHash(h string) string {
	if !strings.HasPrefix(h, "sha256:") {
		return h
	}
	body := strings.TrimPrefix(h, "sha256:")
	if len(body) < 8 {
		return h
	}
	return "sha256:" + body[:4] + "…" + body[len(body)-4:]
}
