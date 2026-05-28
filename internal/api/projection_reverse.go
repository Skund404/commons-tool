package api

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Skund404/commons-tool/internal/indexer"
)

// projectPrimitiveFromUI is the inverse of projection.go's projectPrimitiveToUI.
// It takes the UI shape the frontend uses (names: {canonical, aliases[]},
// specializes: parent-slug, rel: [{type, target: slug}], domain: kind-specific)
// and emits a spec-shape document (properties.names: [canonical, ...aliases],
// relationships: [{type, target: {id, hash, path}}]).
//
// Relationship targets are resolved against the supplied corpus to pin hashes.
// The server's authoritative content_hash is NOT computed here — callers run
// the hasher AFTER this projection so the relationship hashes are stable in
// the preimage.
type uiProjectionInput struct {
	UI      map[string]any
	Corpus  []indexer.Item
	NowDate string // ISO YYYY-MM-DD; injected so tests can pin time
}

// ResolutionError flags an unresolvable relationship target. Surfaced as 400
// in the create/update handler so the user sees actionable detail.
type ResolutionError struct {
	Field  string
	Target string
	Reason string
}

func (e *ResolutionError) Error() string {
	return fmt.Sprintf("relationship %s target %q: %s", e.Field, e.Target, e.Reason)
}

// projectPrimitiveFromUI returns the spec-shape document plus the list of
// hard resolution errors. The hash field is left empty; computed by caller.
func projectPrimitiveFromUI(in uiProjectionInput) (map[string]any, []ResolutionError) {
	ui := in.UI
	if ui == nil {
		return nil, []ResolutionError{{Field: "doc", Reason: "empty body"}}
	}

	bySlug := map[string]indexer.Item{}
	for _, it := range in.Corpus {
		if s, _ := it.Doc["slug"].(string); s != "" {
			bySlug[s] = it
		}
	}

	kind, _ := ui["kind"].(string)
	slug, _ := ui["slug"].(string)
	name, _ := ui["name"].(string)
	desc, _ := ui["desc"].(string)
	emitter, _ := ui["emitter"].(string)
	id, _ := ui["id"].(string)
	if id == "" && slug != "" {
		// Make a stable id from the slug if the caller didn't provide one.
		id = slug + "-" + shortStamp(in.NowDate)
	}

	created := in.NowDate
	if created == "" {
		created = time.Now().UTC().Format("2006-01-02")
	}
	modified := created

	// ─── properties block ───────────────────────────────────────────
	props := map[string]any{
		"status":     "active",
		"license":    coalesceLicense(ui),
		"persistent": true,
	}

	// names: {lang: {canonical, aliases[]}} → {lang: [canonical, ...aliases]}
	if rawNames, ok := ui["names"].(map[string]any); ok {
		specNames := map[string]any{}
		for lang, v := range rawNames {
			entry, _ := v.(map[string]any)
			if entry == nil {
				continue
			}
			canonical, _ := entry["canonical"].(string)
			if canonical == "" {
				continue
			}
			arr := []any{canonical}
			if aliases, ok := entry["aliases"].([]any); ok {
				for _, a := range aliases {
					if s, ok := a.(string); ok && s != "" {
						arr = append(arr, s)
					}
				}
			}
			specNames[lang] = arr
		}
		props["names"] = specNames
	}

	// Kind-specific domain fields fold into properties.
	if domain, ok := ui["domain"].(map[string]any); ok {
		switch kind {
		case "tool":
			if v, ok := domain["category"]; ok && v != nil {
				props["category"] = v
			}
			if v, ok := domain["manufacturer"]; ok && v != nil {
				props["manufacturer"] = v
			}
		case "material":
			if v, ok := domain["materialType"]; ok && v != nil {
				props["material_type"] = v
			}
			if v, ok := domain["unit"]; ok && v != nil {
				props["unit"] = v
			}
		case "technique":
			if v, ok := domain["skillLevel"]; ok && v != nil {
				props["skill_level"] = v
			}
			if v, ok := domain["steps"]; ok && v != nil {
				props["steps"] = v
			}
		case "workflow":
			if v, ok := domain["difficulty"]; ok && v != nil {
				props["difficulty"] = v
			}
			if v, ok := domain["steps"]; ok && v != nil {
				props["steps"] = v
			}
		}
	}

	// ─── relationships block ────────────────────────────────────────
	var rels []any
	var errs []ResolutionError

	emitRel := func(t string, slugTarget string, i int) {
		if slugTarget == "" {
			return
		}
		target, ok := bySlug[slugTarget]
		if !ok {
			errs = append(errs, ResolutionError{
				Field:  fmt.Sprintf("relationships[%d]", i),
				Target: slugTarget,
				Reason: "no primitive with this slug in corpus",
			})
			return
		}
		tHash, _ := target.Doc["content_hash"].(string)
		tID, _ := target.Doc["id"].(string)
		rels = append(rels, map[string]any{
			"type": t,
			"target": map[string]any{
				"id":   tID,
				"hash": tHash,
				"path": target.Path,
			},
		})
	}

	// specializes: parent-slug folds into relationships[type=specializes].
	if sp, _ := ui["specializes"].(string); sp != "" {
		emitRel("specializes", sp, 0)
	}

	// rel[]: {type, target: slug} → {type, target: {id, hash, path}}.
	if rawRel, ok := ui["rel"].([]any); ok {
		for i, raw := range rawRel {
			rel, _ := raw.(map[string]any)
			if rel == nil {
				continue
			}
			t, _ := rel["type"].(string)
			tg, _ := rel["target"].(string)
			emitRel(t, tg, i)
		}
	}

	// ─── tags ───────────────────────────────────────────────────────
	var tags []any
	if rawTags, ok := ui["tags"].([]any); ok {
		for _, v := range rawTags {
			if s, ok := v.(string); ok && s != "" {
				tags = append(tags, s)
			}
		}
	}

	// ─── lineage ────────────────────────────────────────────────────
	provenance := "unasserted"
	outcome := "unknown"
	if s, _ := ui["provenanceState"].(string); s != "" {
		provenance = s
	}
	if s, _ := ui["outcome"].(string); s != "" {
		outcome = s
	}

	// ─── media (URL-only refs per locked policy) ───────────────────
	var media []any
	if rawMedia, ok := ui["media"].([]any); ok {
		for _, v := range rawMedia {
			m, _ := v.(map[string]any)
			if m == nil {
				continue
			}
			url, _ := m["url"].(string)
			if url == "" {
				continue
			}
			entry := map[string]any{"url": url}
			if c, _ := m["caption"].(string); c != "" {
				entry["caption"] = c
			}
			media = append(media, entry)
		}
	}

	// ─── assemble ───────────────────────────────────────────────────
	out := map[string]any{
		"opgl_version": "0.6",
		"emitter":      emitter,
		"id":           id,
		"slug":         slug,
		"kind":         kind,
		"name":         name,
		"description":  desc,
		"visibility":   "commons",
		"created":      created,
		"modified":     modified,
		"tags":         tags,
		"properties":   props,
		"relationships": rels,
		"lineage": map[string]any{
			"provenance_state": provenance,
			"outcome":          outcome,
		},
	}
	if len(media) > 0 {
		out["media"] = media
	}
	return out, errs
}

func coalesceLicense(ui map[string]any) string {
	if s, _ := ui["license"].(string); s != "" {
		return s
	}
	if props, ok := ui["properties"].(map[string]any); ok {
		if s, _ := props["license"].(string); s != "" {
			return s
		}
	}
	return "CC-BY-4.0"
}

func shortStamp(date string) string {
	if date == "" {
		return time.Now().UTC().Format("20060102")
	}
	return strings.ReplaceAll(date, "-", "")
}

// kindPath returns the canonical sub-directory under primitives/ for a given
// kind. Matches the conventions used by the mock corpus and the indexer.
func kindPath(kind string) (string, error) {
	switch kind {
	case "tool":
		return "primitives/tools", nil
	case "material":
		return "primitives/materials", nil
	case "technique":
		return "primitives/techniques", nil
	case "workflow":
		return "primitives/workflows", nil
	case "project":
		return "primitives/projects", nil
	case "event":
		return "primitives/events", nil
	default:
		return "", errors.New("unknown kind: " + kind)
	}
}
