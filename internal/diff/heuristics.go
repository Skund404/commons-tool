package diff

import (
	"fmt"
	"sort"
	"strings"

	commonsgit "github.com/Skund404/commons-tool/internal/git"
	"github.com/Skund404/commons-tool/internal/indexer"
)

// heuristicAliasCollision detects aliases that already resolve to a different
// primitive in the existing corpus. Emits one WARN per language with collision.
func heuristicAliasCollision(sc *commonsgit.SemanticChange, corpus []indexer.Item) []Recommendation {
	if sc.After == nil {
		return nil
	}
	// Build resolve over the existing primitive corpus only (categories are not
	// the subject of a primitive-alias collision check).
	resolve := indexer.BuildResolve(nil, corpus)
	props, _ := sc.After["properties"].(map[string]any)
	names, _ := props["names"].(map[string]any)
	if names == nil {
		return nil
	}
	mySlug, _ := sc.After["slug"].(string)

	collisions := map[string][]string{} // language → list of colliding keys
	for lang, raw := range names {
		arr, ok := raw.([]any)
		if !ok {
			continue
		}
		langFile, ok := resolve[lang]
		if !ok {
			continue
		}
		for _, name := range arr {
			s, ok := name.(string)
			if !ok {
				continue
			}
			key := indexer.NormalizeKey(s)
			entries, ok := langFile.Entries[key]
			if !ok {
				continue
			}
			// Don't flag self (the entry whose ref path carries this slug).
			if entriesMatchSelf(entries, mySlug) {
				continue
			}
			collisions[lang] = append(collisions[lang], s)
		}
	}
	if len(collisions) == 0 {
		return nil
	}
	// Sort languages alphabetically with `en` first; aliases stably within.
	var langs []string
	for lang := range collisions {
		langs = append(langs, lang)
	}
	sort.SliceStable(langs, func(i, j int) bool {
		if langs[i] == "en" {
			return true
		}
		if langs[j] == "en" {
			return false
		}
		return langs[i] < langs[j]
	})
	// The primary alias to surface in the title is the first English collision
	// when present, otherwise the first collision in the sorted language order.
	primaryLang := langs[0]
	primaryAlias := collisions[primaryLang][0]
	sort.Strings(collisions[primaryLang])
	if len(collisions[primaryLang]) > 0 {
		primaryAlias = collisions[primaryLang][0]
	}
	return []Recommendation{{
		Sev:     SevWarn,
		Title:   fmt.Sprintf("%q alias collides with existing primitive", primaryAlias),
		Body:    fmt.Sprintf("Alias %q already resolves to an existing primitive. Users will see disambiguation on search results in %s.", primaryAlias, strings.Join(langs, ", ")),
		File:    "indexes/resolve/" + primaryLang + ".json",
		Suggest: "Either drop the alias, or accept the disambiguation.",
	}}
}

// entriesMatchSelf reports whether the resolve entry list contains only the
// primitive being authored (matched by its slug appearing in the entry ref
// path), in which case the "collision" is the primitive resolving to itself.
func entriesMatchSelf(entries []indexer.Entry, mySlug string) bool {
	if len(entries) == 0 {
		return false
	}
	for _, e := range entries {
		if !strings.Contains(e.Ref, "/"+mySlug+".json") {
			return false
		}
	}
	return true
}

// heuristicKindMismatch flags suspected mis-classifications. A primitive of
// kind=technique that carries tool-shaped fields (manufacturer, category,
// model_number, etc.) is likely a tool.
func heuristicKindMismatch(sc *commonsgit.SemanticChange) []Recommendation {
	if sc.Class != commonsgit.ClassPrimitive || sc.After == nil {
		return nil
	}
	kind, _ := sc.After["kind"].(string)
	props, _ := sc.After["properties"].(map[string]any)
	if props == nil {
		return nil
	}
	toolShaped := []string{"manufacturer", "model_number", "sku"}
	techniqueShaped := []string{"steps", "skill_level", "duration_minutes"}
	materialShaped := []string{"material_type", "unit", "supplier"}

	scoreShape := func(keys []string) int {
		n := 0
		for _, k := range keys {
			if _, ok := props[k]; ok {
				n++
			}
		}
		return n
	}
	tScore := scoreShape(toolShaped)
	techScore := scoreShape(techniqueShaped)
	mScore := scoreShape(materialShaped)

	switch kind {
	case "technique":
		if tScore >= 2 && techScore == 0 {
			return []Recommendation{{
				Sev:     SevReject,
				Title:   "Kind mismatch: should be `tool`, not `technique`",
				Body:    "Primitive describes a physical instrument (manufacturer / sku fields present) but kind is `technique`. Schema validates by accident because both kinds share a base shape. Reclassify as kind=tool, or split into tool + technique primitives.",
				File:    sc.Path,
				Suggest: "Change kind to `tool` and move file to primitives/tools/",
			}}
		}
	case "tool":
		if techScore >= 2 && tScore == 0 {
			return []Recommendation{{
				Sev:     SevReject,
				Title:   "Kind mismatch: should be `technique`, not `tool`",
				Body:    "Primitive describes a procedure (steps / skill_level present) but kind is `tool`. Reclassify.",
				File:    sc.Path,
				Suggest: "Change kind to `technique` and move file to primitives/techniques/",
			}}
		}
	case "material":
		if tScore >= 2 && mScore == 0 {
			return []Recommendation{{
				Sev:     SevReject,
				Title:   "Kind mismatch: should be `tool`, not `material`",
				Body:    "Primitive describes a physical instrument but kind is `material`.",
				File:    sc.Path,
				Suggest: "Change kind to `tool` and move file to primitives/tools/",
			}}
		}
	}
	return nil
}

// heuristicOutsideCraft flags primitives whose names/tags fall outside the
// configured primary craft for this commons.
func heuristicOutsideCraft(sc *commonsgit.SemanticChange, settings RecommendSettings) []Recommendation {
	if sc.Class != commonsgit.ClassPrimitive || sc.After == nil {
		return nil
	}
	if settings.PrimaryCraft == "" || len(settings.PrimaryCraftKeywords) == 0 {
		return nil
	}
	hay := []string{}
	if n, _ := sc.After["name"].(string); n != "" {
		hay = append(hay, strings.ToLower(n))
	}
	if d, _ := sc.After["description"].(string); d != "" {
		hay = append(hay, strings.ToLower(d))
	}
	if tags, _ := sc.After["tags"].([]any); tags != nil {
		for _, t := range tags {
			if s, ok := t.(string); ok {
				hay = append(hay, strings.ToLower(s))
			}
		}
	}
	props, _ := sc.After["properties"].(map[string]any)
	if cat, _ := props["category"].(string); cat != "" {
		hay = append(hay, strings.ToLower(cat))
	}

	combined := strings.Join(hay, " | ")
	for _, kw := range settings.PrimaryCraftKeywords {
		if strings.Contains(combined, strings.ToLower(kw)) {
			return nil
		}
	}
	return []Recommendation{{
		Sev:     SevWarn,
		Title:   "Outside primary craft domain",
		Body:    fmt.Sprintf("Primary commons is %s. This primitive does not match any of the in-domain keywords. Consider routing to an adjacent federation root.", settings.PrimaryCraft),
		File:    sc.Path,
	}}
}
