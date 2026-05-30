package api

import (
	"path/filepath"
	"strings"

	"github.com/Skund404/commons-tool/internal/indexer"
)

// projectPrimitiveToUI converts the spec-shape primitive (properties.names as
// [canonical, ...aliases], relationships array) into the frontend's flatter
// UI shape (names: {canonical, aliases[]}, specializes: parent slug, rel[],
// domain: kind-specific fields).
//
// This adapter is the agreed Go-side projection — see prompt's "shape adapter"
// decision (2026-05-28).
func projectPrimitiveToUI(it indexer.Item) map[string]any {
	doc := it.Doc
	props, _ := doc["properties"].(map[string]any)
	kind, _ := doc["kind"].(string)

	// names: spec {lang: [canonical, ...aliases]} → ui {lang: {canonical, aliases[]}}
	uiNames := map[string]any{}
	if raw, _ := props["names"].(map[string]any); raw != nil {
		for lang, v := range raw {
			arr, ok := v.([]any)
			if !ok || len(arr) == 0 {
				continue
			}
			canonical, _ := arr[0].(string)
			aliases := make([]string, 0, len(arr)-1)
			for i := 1; i < len(arr); i++ {
				if s, ok := arr[i].(string); ok {
					aliases = append(aliases, s)
				}
			}
			uiNames[lang] = map[string]any{
				"canonical": canonical,
				"aliases":   aliases,
			}
		}
	}

	// relationships: extract specializes parent slug, surface the rest as rel[]
	var specializes any
	uiRel := []map[string]any{}
	if rels, _ := doc["relationships"].([]any); rels != nil {
		for _, r := range rels {
			rel, _ := r.(map[string]any)
			if rel == nil {
				continue
			}
			t, _ := rel["type"].(string)
			target, _ := rel["target"].(map[string]any)
			if target == nil {
				continue
			}
			targetSlug := slugFromPath(target["path"])
			if targetSlug == "" {
				if id, _ := target["id"].(string); id != "" {
					targetSlug = id
				}
			}
			if t == "specializes" {
				specializes = targetSlug
				continue
			}
			uiRel = append(uiRel, map[string]any{
				"type":   t,
				"target": targetSlug,
			})
		}
	}

	// domain: kind-specific properties
	domain := map[string]any{}
	switch kind {
	case "tool":
		domain["category"] = props["category"]
		domain["manufacturer"] = props["manufacturer"]
	case "material":
		domain["materialType"] = firstNonEmpty(props["material_type"], props["materialType"])
		domain["unit"] = props["unit"]
	case "technique":
		domain["skillLevel"] = firstNonEmpty(props["skill_level"], props["skillLevel"])
		domain["steps"] = props["steps"]
	case "workflow":
		domain["difficulty"] = props["difficulty"]
		domain["steps"] = props["steps"]
	}

	// license
	lic, _ := props["license"].(string)
	if lic == "" {
		lic = "CC-BY-4.0"
	}

	// state — map visibility/status to UI lifecycle vocabulary
	state := "published"
	if vis, _ := doc["visibility"].(string); vis != "" && vis != "commons" {
		state = "validated"
	}
	if status, _ := props["status"].(string); status == "draft" {
		state = "draft"
	}

	// tags — coerce to []string (frontend expects array; spec may emit []any)
	tags := []string{}
	if t, _ := doc["tags"].([]any); t != nil {
		for _, v := range t {
			if s, ok := v.(string); ok {
				tags = append(tags, s)
			}
		}
	}

	out := map[string]any{
		"id":          doc["id"],
		"kind":        kind,
		"name":        doc["name"],
		"slug":        doc["slug"],
		"desc":        doc["description"],
		"hash":        doc["content_hash"],
		"emitter":     doc["emitter"],
		"license":     lic,
		"state":       state,
		"tags":        tags,
		"names":       uiNames,
		"specializes": specializes,
		"taxonomy":    props["taxonomy"], // category-membership id (addendum §A.3); may be nil
		"rel":         uiRel,
		"domain":      domain,
	}
	if lin, _ := doc["lineage"].(map[string]any); lin != nil {
		if ps, _ := lin["provenance_state"].(string); ps != "" {
			out["provenanceState"] = ps
		}
		if oc, _ := lin["outcome"].(string); oc != "" {
			out["outcome"] = oc
		}
	}
	return out
}

// slugFromPath turns "primitives/tools/awl.json" → "awl".
func slugFromPath(v any) string {
	s, ok := v.(string)
	if !ok || s == "" {
		return ""
	}
	base := filepath.Base(s)
	return strings.TrimSuffix(base, filepath.Ext(base))
}

func firstNonEmpty(vs ...any) any {
	for _, v := range vs {
		if v == nil {
			continue
		}
		if s, ok := v.(string); ok && s == "" {
			continue
		}
		return v
	}
	return nil
}

// projectBundleToUI converts a spec-shape bundle to the frontend's Bundle
// shape (names: {lang: {name, desc}}, items: {kind, slug, role}).
func projectBundleToUI(doc map[string]any) map[string]any {
	uiNames := map[string]any{}
	nameByLang, _ := doc["name"].(map[string]any)
	descByLang, _ := doc["description"].(map[string]any)
	langSet := map[string]bool{}
	for l := range nameByLang {
		langSet[l] = true
	}
	for l := range descByLang {
		langSet[l] = true
	}
	for lang := range langSet {
		uiNames[lang] = map[string]any{
			"name": nameByLang[lang],
			"desc": descByLang[lang],
		}
	}
	uiItems := []map[string]any{}
	if items, _ := doc["items"].([]any); items != nil {
		for _, raw := range items {
			it, _ := raw.(map[string]any)
			if it == nil {
				continue
			}
			cls, _ := it["record_class"].(string)
			k, _ := it["kind"].(string)
			if cls == "bundle" {
				k = "bundle"
			}
			uiItems = append(uiItems, map[string]any{
				"kind": k,
				"slug": it["slug"],
				"role": it["role"],
				"note": it["note"], // localized {lang: string} or nil
			})
		}
	}
	state := "published"
	lic, _ := doc["license"].(string)
	if lic == "" {
		lic = "CC-BY-4.0"
	}
	// lifecycle is the bundle's open/closed state (addendum §B.5), distinct from
	// the UI-lifecycle `state` (published/validated/draft). Default open.
	lifecycle, _ := doc["state"].(string)
	if lifecycle != "open" && lifecycle != "closed" {
		lifecycle = "open"
	}
	out := map[string]any{
		"id":         doc["slug"],
		"slug":       doc["slug"],
		"hash":       doc["content_hash"],
		"emitter":    doc["emitter"],
		"license":    lic,
		"state":      state,
		"lifecycle":  lifecycle,
		"names":      uiNames,
		"items":      uiItems,
	}
	if succ, ok := doc["successors"].([]any); ok && len(succ) > 0 {
		out["successors"] = succ
	}
	return out
}
