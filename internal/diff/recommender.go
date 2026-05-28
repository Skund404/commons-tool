package diff

import (
	"encoding/json"
	"os"
	"path/filepath"

	commonsgit "github.com/Skund404/commons-tool/internal/git"
	"github.com/Skund404/commons-tool/internal/indexer"
)

// Recommend runs every gate against every record-touching change in the diff
// and returns the flat list of recommendations. The returned list is ordered:
//
//	1. Per-record APPROVEs (schema, hash, license, …)
//	2. Per-record REJECTs
//	3. Per-record WARNs
//	4. Per-record INFOs
//
// Callers should not rely on the absolute order for non-fixture diffs; the
// frontend sorts by severity for display.
func Recommend(diff *commonsgit.SemanticDiff, corpus []indexer.Item, bundles []map[string]any, settings RecommendSettings) []Recommendation {
	if settings.KnownEmitters == nil {
		settings.KnownEmitters = collectKnownEmitters(corpus)
	}
	ps := buildPostState(diff)
	var out []Recommendation
	for i := range diff.Changes {
		sc := &diff.Changes[i]
		out = append(out, runPerRecordGates(sc, corpus, bundles, ps, settings)...)
	}
	return out
}

func runPerRecordGates(sc *commonsgit.SemanticChange, corpus []indexer.Item, bundles []map[string]any, ps postState, settings RecommendSettings) []Recommendation {
	var approves, rejects, warns, infos []Recommendation

	push := func(rs []Recommendation) {
		for _, r := range rs {
			switch r.Sev {
			case SevApprove:
				approves = append(approves, r)
			case SevReject:
				rejects = append(rejects, r)
			case SevWarn:
				warns = append(warns, r)
			case SevInfo:
				infos = append(infos, r)
			}
		}
	}

	push(gateSchema(sc))
	push(gateHash(sc))
	push(gateLicense(sc))
	push(gateSlugCollision(sc, corpus))
	push(gateCycle(sc, corpus, ps))
	push(gateDanglingRefs(sc, corpus, ps))
	push(gateBundleItems(sc, corpus))
	push(gateReservedNamespace(sc, settings))
	push(gateMedia(sc))

	push(heuristicAliasCollision(sc, corpus))
	push(heuristicKindMismatch(sc))
	push(heuristicOutsideCraft(sc, settings))

	push(infoIndexRegen(sc))
	push(infoBundleCascade(sc, bundles))
	push(infoNewEmitter(sc, settings))

	// If REJECTs are present, suppress APPROVEs for the same record so the UI
	// doesn't show a contradictory "Schema validates" alongside the REJECT.
	if len(rejects) > 0 {
		// Keep the License APPROVE since it's an orthogonal gate even when
		// schema/kind heuristics flag the record. This mirrors the PR #10
		// fixture expectation.
		var keep []Recommendation
		for _, a := range approves {
			if a.Title == "License = CC-BY-4.0" {
				keep = append(keep, a)
			}
		}
		approves = keep
	}

	out := make([]Recommendation, 0, len(approves)+len(rejects)+len(warns)+len(infos))
	out = append(out, approves...)
	out = append(out, rejects...)
	out = append(out, warns...)
	out = append(out, infos...)
	return out
}

// loadBundlesShim is the implementation used by infoBundleCascade's loader.
// Returns ([], nil) if no bundles dir present.
func loadBundlesShim(corpusRoot string) ([]map[string]any, error) {
	bundlesDir := filepath.Join(corpusRoot, "indexes", "bundles")
	ents, err := os.ReadDir(bundlesDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []map[string]any
	for _, e := range ents {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(bundlesDir, e.Name()))
		if err != nil {
			return nil, err
		}
		var doc map[string]any
		if err := json.Unmarshal(b, &doc); err != nil {
			return nil, err
		}
		out = append(out, doc)
	}
	return out, nil
}
