package api

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Skund404/commons-tool/internal/hash"
	"github.com/Skund404/commons-tool/internal/indexer"
	"github.com/Skund404/commons-tool/internal/schema"
)

// intake_incoming.go — explode a HideSync "ship" file from
// contributions/incoming/ into the canonical corpus.
//
// A ship file is a single record, a dependency CLOSURE (array of primitive
// records), or a BUNDLE record followed by its member primitives. Primitives
// are written verbatim (they already arrive in canonical commons wire shape
// from the reference implementation, with consistent hashes) to
// primitives/<kind>s/<slug>.json; bundles in HideSync's authoring shape
// (nested target + per-item note, string name) are MAPPED to the canonical
// schema.Bundle shape before writing to indexes/bundles/. Indexes are rebuilt
// once at the end.
//
// This is the maintainer's batch counterpart to the web Intake pane; it never
// runs unless invoked, and `apply=false` is a dry run (parse + validate +
// report, no writes). The maintainer holds canonical write authority.

// dirToKind reverses the plural-kind directory back to the singular OPG kind.
var dirToKind = map[string]string{
	"tools": "tool", "materials": "material", "techniques": "technique",
	"workflows": "workflow", "projects": "project", "events": "event",
}

// IncomingReport summarizes one processed contribution file.
type IncomingReport struct {
	File              string   `json:"file"`
	PrimitivesCreated []string `json:"primitives_created"`
	PrimitivesUpdated []string `json:"primitives_updated"`
	Bundles           []string `json:"bundles"`
	Warnings          []string `json:"warnings"`
	Errors            []string `json:"errors"`
}

func (r *IncomingReport) hardFailed() bool { return len(r.Errors) > 0 }

// IntakeIncoming processes each file (closure / bundle ship) into the canonical
// corpus. apply=false is a dry run. defaultEmitter is stamped on bundles that
// arrive without one. Returns one report per file. The error return is reserved
// for I/O failures that abort the whole run; per-file/per-record problems are
// collected in the reports.
func IntakeIncoming(corpusRoot string, files []string, apply bool, defaultEmitter string) ([]IncomingReport, error) {
	reports := make([]IncomingReport, 0, len(files))
	wroteAnything := false

	for _, f := range files {
		rep := IncomingReport{File: f}
		records, err := readIncomingRecords(f)
		if err != nil {
			rep.Errors = append(rep.Errors, err.Error())
			reports = append(reports, rep)
			continue
		}

		var primitives, bundles []map[string]any
		for i, rec := range records {
			switch {
			case rec == nil:
				rep.Errors = append(rep.Errors, fmt.Sprintf("record[%d]: not a JSON object", i))
			case asString(rec["record_class"]) == "bundle":
				bundles = append(bundles, rec)
			default:
				primitives = append(primitives, rec)
			}
		}

		// Primitives first — written verbatim after validation.
		for _, p := range primitives {
			created, err := intakePrimitive(corpusRoot, p, apply)
			if err != nil {
				rep.Errors = append(rep.Errors, err.Error())
				continue
			}
			slug := asString(p["slug"])
			if created {
				rep.PrimitivesCreated = append(rep.PrimitivesCreated, slug)
			} else {
				rep.PrimitivesUpdated = append(rep.PrimitivesUpdated, slug)
			}
			wroteAnything = wroteAnything || apply
		}

		// Bundles — mapped to canonical shape, then written.
		for _, b := range bundles {
			canonical, warns, err := canonicalizeBundle(b, defaultEmitter)
			rep.Warnings = append(rep.Warnings, warns...)
			if err != nil {
				rep.Errors = append(rep.Errors, err.Error())
				continue
			}
			if verrs := validateBundleDoc(canonical); len(verrs) > 0 {
				for _, e := range verrs {
					rep.Errors = append(rep.Errors, fmt.Sprintf("bundle %s: %v", asString(canonical["slug"]), e))
				}
				continue
			}
			if apply {
				if err := writeBundle(corpusRoot, canonical); err != nil {
					rep.Errors = append(rep.Errors, err.Error())
					continue
				}
				wroteAnything = true
			}
			rep.Bundles = append(rep.Bundles, asString(canonical["slug"]))
		}

		// Remove the staged file once its records landed cleanly.
		if apply && !rep.hardFailed() {
			if err := os.Remove(f); err != nil {
				rep.Warnings = append(rep.Warnings, "could not remove staged file: "+err.Error())
			}
		}
		reports = append(reports, rep)
	}

	// Rebuild indexes once, against the post-write corpus.
	if apply && wroteAnything {
		corpus, err := indexer.LoadCorpus(corpusRoot, "primitives")
		if err != nil {
			return reports, fmt.Errorf("reload corpus: %w", err)
		}
		if err := regenAllIndexes(corpusRoot, corpus); err != nil {
			return reports, fmt.Errorf("regen indexes: %w", err)
		}
	}
	return reports, nil
}

// readIncomingRecords parses a ship file into a list of record maps. Accepts a
// single object or an array.
func readIncomingRecords(path string) ([]map[string]any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimSpace(string(data))
	if strings.HasPrefix(trimmed, "[") {
		var arr []map[string]any
		if err := json.Unmarshal(data, &arr); err != nil {
			return nil, fmt.Errorf("%s: parse array: %w", filepath.Base(path), err)
		}
		return arr, nil
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, fmt.Errorf("%s: parse object: %w", filepath.Base(path), err)
	}
	return []map[string]any{obj}, nil
}

// intakePrimitive validates a canonical commons primitive record and writes it
// verbatim to primitives/<kind>s/<slug>.json. Returns whether it was newly
// created (vs an update of an existing slug).
func intakePrimitive(corpusRoot string, doc map[string]any, apply bool) (created bool, err error) {
	kind := asString(doc["kind"])
	slug := asString(doc["slug"])
	if kind == "" || slug == "" {
		return false, fmt.Errorf("primitive missing kind/slug")
	}
	if verrs := runSchemaValidation(doc); len(verrs) > 0 {
		return false, fmt.Errorf("primitive %s: %s", slug, formatSchemaErrors(verrs))
	}
	rel, err := kindPath(kind)
	if err != nil {
		return false, err
	}
	target := filepath.Join(corpusRoot, filepath.FromSlash(rel), slug+".json")
	_, statErr := os.Stat(target)
	created = os.IsNotExist(statErr)
	if !apply {
		return created, nil
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return false, fmt.Errorf("mkdir: %w", err)
	}
	if err := atomicWriteJSON(target, doc); err != nil {
		return false, fmt.Errorf("write %s: %w", slug, err)
	}
	return created, nil
}

// canonicalizeBundle maps a bundle record to the canonical schema.Bundle shape.
// A bundle already in canonical shape (flat items with record_class) is passed
// through (content_hash recomputed). HideSync's authoring shape (items with a
// nested target + note, name as a string, names under properties) is mapped:
// items become flat {record_class, kind, slug, hash, role, note}, name/
// description become per-language maps, and the per-item note is preserved.
func canonicalizeBundle(b map[string]any, defaultEmitter string) (map[string]any, []string, error) {
	slug := asString(b["slug"])
	if slug == "" {
		return nil, nil, fmt.Errorf("bundle missing slug")
	}
	var warnings []string

	out := map[string]any{
		"format_version": "1.0",
		"record_class":   "bundle",
		"slug":           slug,
		"state":          bundleState(b),
		"emitter":        firstNonEmptyStr(asString(b["emitter"]), defaultEmitter),
		"license":        bundleLicense(b),
		"lineage":        map[string]any{"provenance_state": "unasserted", "outcome": "unknown"},
		"name":           bundleNameMap(b),
		"description":    bundleDescriptionMap(b),
	}
	if lin, ok := b["lineage"].(map[string]any); ok {
		out["lineage"] = lin
	}
	// successors[] is append-only + hash-excluded (§B.6); carried verbatim.
	if succ, ok := b["successors"].([]any); ok && len(succ) > 0 {
		out["successors"] = succ
	}

	rawItems, _ := b["items"].([]any)
	items := make([]any, 0, len(rawItems))
	for i, raw := range rawItems {
		it, _ := raw.(map[string]any)
		if it == nil {
			warnings = append(warnings, fmt.Sprintf("bundle %s items[%d] skipped: not an object", slug, i))
			continue
		}
		if asString(it["record_class"]) == "primitive" {
			// Already canonical — keep recognized fields.
			ci := map[string]any{
				"record_class": "primitive",
				"kind":         asString(it["kind"]),
				"slug":         asString(it["slug"]),
				"hash":         asString(it["hash"]),
				"role":         firstNonEmptyStr(asString(it["role"]), "optional"),
			}
			if note := bundleItemNote(it["note"]); note != nil {
				ci["note"] = note
			}
			items = append(items, ci)
			continue
		}
		// Authoring shape: {role, note, target:{id,hash,path}}.
		tgt, _ := it["target"].(map[string]any)
		path := asString(tgt["path"])
		mslug := slugFromBundlePath(path)
		mkind := kindFromBundlePath(path)
		if mslug == "" || mkind == "" {
			warnings = append(warnings, fmt.Sprintf("bundle %s items[%d] skipped: unresolvable target path %q", slug, i, path))
			continue
		}
		ci := map[string]any{
			"record_class": "primitive",
			"kind":         mkind,
			"slug":         mslug,
			"hash":         asString(tgt["hash"]),
			"role":         firstNonEmptyStr(asString(it["role"]), "optional"),
		}
		if note := bundleItemNote(it["note"]); note != nil {
			ci["note"] = note // preserved + localized into the canonical item (Q-005)
		}
		items = append(items, ci)
	}
	out["items"] = items

	// Recompute the bundle's content_hash over the canonical body — the shape
	// changed, so any inbound hash is stale. ComputeBundle excludes successors
	// (§B.4) so the frozen identity survives append-only successor adds.
	delete(out, "content_hash")
	h, err := hash.ComputeBundle(out)
	if err != nil {
		return nil, warnings, fmt.Errorf("bundle %s hash: %w", slug, err)
	}
	out["content_hash"] = h
	return out, warnings, nil
}

// bundleState returns the authored bundle lifecycle state, defaulting to "open"
// (mutable/living) when absent — the §B.5 default for a freshly authored bundle.
func bundleState(b map[string]any) string {
	if s := asString(b["state"]); s == "open" || s == "closed" {
		return s
	}
	return "open"
}

// bundleItemNote normalizes an authored item note into the canonical localized
// {lang: string} map: a plain string (HideSync authoring shape) becomes {en: …};
// an already-localized map is filtered to non-empty string values. Returns nil
// when there is no note.
func bundleItemNote(v any) map[string]any {
	switch n := v.(type) {
	case string:
		if n != "" {
			return map[string]any{"en": n}
		}
	case map[string]any:
		out := map[string]any{}
		for lang, val := range n {
			if s, ok := val.(string); ok && s != "" {
				out[lang] = s
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return nil
}

// validateBundleDoc round-trips a bundle map through the schema struct and runs
// the strict bundle validator.
func validateBundleDoc(doc map[string]any) []error {
	raw, err := json.Marshal(doc)
	if err != nil {
		return []error{fmt.Errorf("re-marshal: %w", err)}
	}
	var b schema.Bundle
	if err := json.Unmarshal(raw, &b); err != nil {
		return []error{fmt.Errorf("re-parse: %w", err)}
	}
	return schema.ValidateBundle(&b)
}

// ── small helpers ──────────────────────────────────────────────────────────

func asString(v any) string {
	s, _ := v.(string)
	return s
}

func firstNonEmptyStr(vs ...string) string {
	for _, v := range vs {
		if v != "" {
			return v
		}
	}
	return ""
}

func bundleLicense(b map[string]any) string {
	if props, ok := b["properties"].(map[string]any); ok {
		if l := asString(props["license"]); l != "" {
			return l
		}
	}
	if l := asString(b["license"]); l != "" {
		return l
	}
	return "CC-BY-4.0"
}

// bundleNameMap builds the per-language name map from properties.names (taking
// the first alias per language), falling back to the top-level string name on
// "en".
func bundleNameMap(b map[string]any) map[string]any {
	out := map[string]any{}
	if props, ok := b["properties"].(map[string]any); ok {
		if names, ok := props["names"].(map[string]any); ok {
			for lang, v := range names {
				switch t := v.(type) {
				case []any:
					if len(t) > 0 {
						out[lang] = asString(t[0])
					}
				case string:
					out[lang] = t
				}
			}
		}
	}
	if _, has := out["en"]; !has {
		if n := asString(b["name"]); n != "" {
			out["en"] = n
		}
	}
	return out
}

// bundleDescriptionMap accepts either a string (→ {en: string}) or an existing
// per-language map.
func bundleDescriptionMap(b map[string]any) map[string]any {
	switch d := b["description"].(type) {
	case map[string]any:
		return d
	case string:
		if d != "" {
			return map[string]any{"en": d}
		}
	}
	return map[string]any{}
}

func slugFromBundlePath(p string) string {
	parts := strings.Split(strings.TrimSpace(p), "/")
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSuffix(parts[len(parts)-1], ".json")
}

// kindFromBundlePath derives the singular kind from a canonical member path
// like "primitives/materials/spaghetti.json".
func kindFromBundlePath(p string) string {
	parts := strings.Split(strings.TrimSpace(p), "/")
	for i, seg := range parts {
		if seg == "primitives" && i+1 < len(parts) {
			return dirToKind[parts[i+1]]
		}
	}
	// Fallback: a two-segment "<dir>/<slug>.json".
	if len(parts) >= 2 {
		return dirToKind[parts[len(parts)-2]]
	}
	return ""
}
