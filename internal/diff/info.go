package diff

import (
	"fmt"
	"strings"

	commonsgit "github.com/Skund404/commons-tool/internal/git"
	"github.com/Skund404/commons-tool/internal/indexer"
)

// infoBundleCascade counts published bundles that reference the changed
// primitive (or its specializes-subtree) and emits an INFO when modified.
func infoBundleCascade(sc *commonsgit.SemanticChange, bundles []map[string]any) []Recommendation {
	if sc.Class != commonsgit.ClassPrimitive {
		return nil
	}
	doc := sc.After
	if doc == nil {
		doc = sc.Before
	}
	if doc == nil {
		return nil
	}
	slug, _ := doc["slug"].(string)
	if slug == "" {
		return nil
	}

	count := 0
	for _, b := range bundles {
		items, _ := b["items"].([]any)
		for _, raw := range items {
			it, _ := raw.(map[string]any)
			s, _ := it["slug"].(string)
			if s == slug {
				count++
				break
			}
		}
	}

	switch sc.Op {
	case commonsgit.OpAdded:
		// Bundle cascade INFO is useful only for new specializations of an
		// existing primitive — flags whether downstream bundles would auto-
		// surface the new child.
		rels, _ := doc["relationships"].([]any)
		hasSpecializes := false
		for _, r := range rels {
			rel, _ := r.(map[string]any)
			if rel["type"] == "specializes" {
				hasSpecializes = true
				break
			}
		}
		if !hasSpecializes {
			return nil
		}
		return []Recommendation{{
			Sev:   SevInfo,
			Title: fmt.Sprintf("Bundle cascade: %d affected", count),
			Body:  bundleCascadeBody(count, slug),
		}}
	case commonsgit.OpModified:
		if count == 0 {
			return nil
		}
		return []Recommendation{{
			Sev:   SevInfo,
			Title: fmt.Sprintf("Bundle cascade: %d affected", count),
			Body:  fmt.Sprintf("This primitive is referenced by %d published bundle(s). Editing it changes their materialization.", count),
		}}
	}
	return nil
}

func bundleCascadeBody(count int, slug string) string {
	if count == 0 {
		return fmt.Sprintf("No published bundles reference %q or its parent subtree.", slug)
	}
	return fmt.Sprintf("%d published bundle(s) include this primitive's parent — they will surface the new specialization on next bundle rebuild.", count)
}

// infoIndexRegen INFO when a primitive or bundle change requires the resolve/
// taxonomy indexes to regenerate.
func infoIndexRegen(sc *commonsgit.SemanticChange) []Recommendation {
	if sc.Op == commonsgit.OpDeleted {
		return []Recommendation{{
			Sev:   SevInfo,
			Title: "Index regeneration needed",
			Body:  "Resolve and taxonomy indexes need a rebuild after deletion.",
		}}
	}
	if sc.Op == commonsgit.OpAdded {
		return []Recommendation{{
			Sev:   SevInfo,
			Title: "Resolve indexes will regenerate cleanly",
			Body:  "New name keys integrate into the existing indexes without conflict.",
		}}
	}
	if sc.NamesChanged || sc.RelationshipsChanged {
		return []Recommendation{{
			Sev:   SevInfo,
			Title: "Index regeneration needed",
			Body:  "Names or relationships changed — resolve and taxonomy indexes need to regenerate.",
		}}
	}
	return nil
}

// infoNewEmitter INFO when a PR introduces a previously unseen emitter URI.
func infoNewEmitter(sc *commonsgit.SemanticChange, settings RecommendSettings) []Recommendation {
	if sc.After == nil {
		return nil
	}
	em, _ := sc.After["emitter"].(string)
	if em == "" {
		return nil
	}
	if settings.KnownEmitters != nil && settings.KnownEmitters[em] {
		return nil
	}
	return []Recommendation{{
		Sev:   SevInfo,
		Title: fmt.Sprintf("Adds new emitter %q (first seen)", em),
		Body:  fmt.Sprintf("This is the first primitive emitted by %s — record will be added to the emitter registry on merge.", em),
	}}
}

// collectKnownEmitters walks the corpus and surfaces the set of emitter URIs
// currently in use. Used to populate RecommendSettings.KnownEmitters.
func collectKnownEmitters(corpus []indexer.Item) map[string]bool {
	out := map[string]bool{}
	for _, it := range corpus {
		if em, _ := it.Doc["emitter"].(string); em != "" {
			out[em] = true
		}
	}
	return out
}

// loadBundlesFromDir reads published bundles from the corpus root's
// indexes/bundles/ directory and returns them as parsed maps.
func loadBundlesFromDir(corpusRoot string) ([]map[string]any, error) {
	_ = strings.TrimSpace // appease imports when bundles slot is empty
	bundles, err := loadBundlesShim(corpusRoot)
	return bundles, err
}
