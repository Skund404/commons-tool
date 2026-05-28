package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/Skund404/commons-tool/internal/indexer"
)

// Intake takes raw pasted text from a Discord/Reddit share, parses it into one
// or many candidate primitives, and (on confirm) queues each as a draft via
// the existing draft pipeline.
//
// Supported paste shapes:
//
//	{...}                 single object
//	[{...}, {...}]        JSON array
//	{...}\n{...}          NDJSON (one object per line)
//	{...}\n---\n{...}     YAML-style document separator
//
// Each candidate is auto-classified as either the OPG-L spec shape
// (properties.names: {lang: [canonical, ...aliases]}) or the UI shape
// (names: {lang: {canonical, aliases[]}}). Spec-shape docs are projected to
// UI shape via projectPrimitiveToUI so the editor / draft pipeline can
// consume them uniformly.

// intakeItem captures one parsed (or attempted-parse) candidate.
type intakeItem struct {
	Index    int            `json:"index"`
	Source   string         `json:"source"`            // "spec" | "ui" | "unknown"
	Slug     string         `json:"slug,omitempty"`
	Kind     string         `json:"kind,omitempty"`
	Name     string         `json:"name,omitempty"`
	UIBody   map[string]any `json:"ui_body,omitempty"` // normalized to UI shape
	Error    string         `json:"error,omitempty"`
	Conflict string         `json:"conflict,omitempty"` // existing slug warning
}

// intakeParseResult is the preview response.
type intakeParseResult struct {
	Items   []intakeItem `json:"items"`
	OkCount int          `json:"ok_count"`
	Errors  int          `json:"errors"`
}

// intakeQueueRequest is the body for POST /api/intake/queue. The frontend
// sends back the (possibly edited) UI bodies it wants to commit to drafts.
type intakeQueueRequest struct {
	Items []map[string]any `json:"items"`
}

// intakeQueueResult is the queue response. Per-item we report either the
// created draft envelope or an error string so the UI can mark each row.
type intakeQueueResult struct {
	Drafts []draftEnvelope `json:"drafts"`
	Errors []string        `json:"errors,omitempty"`
}

// handleIntakeParse parses pasted text and returns a preview.
//
//	POST /api/intake/parse  Body: {"text": "<raw paste>"}
func (s *Server) handleIntakeParse(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if strings.TrimSpace(body.Text) == "" {
		writeError(w, 400, "text required")
		return
	}

	parsed := parseIntakeText(body.Text)
	corpus, _ := indexer.LoadCorpus(s.CorpusRoot, "primitives")

	result := intakeParseResult{Items: make([]intakeItem, 0, len(parsed))}
	for i, raw := range parsed {
		item := intakeItem{Index: i}
		if raw.err != nil {
			item.Error = raw.err.Error()
			result.Errors++
			result.Items = append(result.Items, item)
			continue
		}
		shape := detectShape(raw.doc)
		item.Source = shape
		switch shape {
		case "spec":
			// Re-run the existing projection to normalize to UI shape.
			uiBody := projectPrimitiveToUI(indexer.Item{Doc: raw.doc, Path: ""})
			item.UIBody = uiBody
			item.Slug, _ = uiBody["slug"].(string)
			item.Kind, _ = uiBody["kind"].(string)
			item.Name, _ = uiBody["name"].(string)
		case "ui":
			item.UIBody = raw.doc
			item.Slug, _ = raw.doc["slug"].(string)
			item.Kind, _ = raw.doc["kind"].(string)
			item.Name, _ = raw.doc["name"].(string)
		default:
			item.Error = "could not detect a primitive shape (missing slug/kind/names)"
			result.Errors++
			result.Items = append(result.Items, item)
			continue
		}
		if item.Slug != "" {
			if existing, _ := findBySlug(corpus, item.Slug); existing != nil {
				item.Conflict = fmt.Sprintf("slug %q already exists at %s", item.Slug, existing.Path)
			}
		}
		result.OkCount++
		result.Items = append(result.Items, item)
	}
	writeJSON(w, 200, result)
}

// handleIntakeQueue takes the (possibly user-edited) UI bodies and creates one
// draft per item via the existing draft pipeline. Per-item errors are reported
// alongside successes so the user can retry only the failures.
//
//	POST /api/intake/queue  Body: {"items": [<ui-body>, ...]}
func (s *Server) handleIntakeQueue(w http.ResponseWriter, r *http.Request) {
	var body intakeQueueRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if len(body.Items) == 0 {
		writeError(w, 400, "items required")
		return
	}
	out := intakeQueueResult{Drafts: make([]draftEnvelope, 0, len(body.Items))}
	for i, item := range body.Items {
		env := &draftEnvelope{
			ID:   newDraftID(),
			Body: item,
		}
		env.Slug, _ = item["slug"].(string)
		env.Kind, _ = item["kind"].(string)
		env.Title, _ = item["name"].(string)
		// CreatedAt: now; ModifiedAt set by writeDraft.
		if err := s.writeDraft(env); err != nil {
			out.Errors = append(out.Errors, fmt.Sprintf("item[%d]: %s", i, err.Error()))
			continue
		}
		out.Drafts = append(out.Drafts, *env)
	}
	writeJSON(w, 200, out)
}

// ─────────── parsing helpers ───────────

type parsedDoc struct {
	doc map[string]any
	err error
}

// parseIntakeText is the multi-format parser. Tries each shape in order:
//
//	1. JSON array            [{...}, {...}]
//	2. Single JSON object    {...}
//	3. NDJSON                {...}\n{...}
//	4. ---separated docs     {...}\n---\n{...}
//
// Empty / whitespace input returns an empty slice.
func parseIntakeText(text string) []parsedDoc {
	trim := strings.TrimSpace(text)
	if trim == "" {
		return nil
	}

	// 1. Whole-blob JSON array.
	if strings.HasPrefix(trim, "[") {
		var arr []map[string]any
		if err := json.Unmarshal([]byte(trim), &arr); err == nil {
			out := make([]parsedDoc, len(arr))
			for i, d := range arr {
				out[i] = parsedDoc{doc: d}
			}
			return out
		}
	}

	// 2. Single JSON object.
	if strings.HasPrefix(trim, "{") {
		var single map[string]any
		if err := json.Unmarshal([]byte(trim), &single); err == nil {
			return []parsedDoc{{doc: single}}
		}
	}

	// 3 / 4. Multi-doc paste. Split on lines that are exactly "---" (yaml
	// separator). For inputs without separators, each "chunk" is the entire
	// text, then we further try NDJSON.
	chunks := splitOnDashes(text)
	if len(chunks) > 1 {
		out := make([]parsedDoc, 0, len(chunks))
		for _, c := range chunks {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			var d map[string]any
			if err := json.Unmarshal([]byte(c), &d); err != nil {
				out = append(out, parsedDoc{err: fmt.Errorf("parse: %w", err)})
				continue
			}
			out = append(out, parsedDoc{doc: d})
		}
		return out
	}

	// 4. NDJSON: one object per line.
	if strings.Contains(trim, "\n") {
		lines := strings.Split(trim, "\n")
		out := make([]parsedDoc, 0, len(lines))
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var d map[string]any
			if err := json.Unmarshal([]byte(line), &d); err != nil {
				out = append(out, parsedDoc{err: fmt.Errorf("parse: %w", err)})
				continue
			}
			out = append(out, parsedDoc{doc: d})
		}
		// Sanity: at least one line must have parsed for this branch to count.
		anyOK := false
		for _, p := range out {
			if p.err == nil {
				anyOK = true
				break
			}
		}
		if anyOK {
			return out
		}
	}

	// Fall-through: single parse failure.
	var x map[string]any
	if err := json.Unmarshal([]byte(trim), &x); err != nil {
		return []parsedDoc{{err: fmt.Errorf("parse: %w", err)}}
	}
	return []parsedDoc{{doc: x}}
}

// splitOnDashes splits text on lines that are exactly "---" after trimming.
func splitOnDashes(text string) []string {
	lines := strings.Split(text, "\n")
	chunks := []string{}
	current := strings.Builder{}
	for _, line := range lines {
		if strings.TrimSpace(line) == "---" {
			chunks = append(chunks, current.String())
			current.Reset()
			continue
		}
		current.WriteString(line)
		current.WriteString("\n")
	}
	chunks = append(chunks, current.String())
	return chunks
}

// detectShape returns "spec" if the doc looks like an OPG-L spec record,
// "ui" if it matches the frontend Primitive type, "unknown" otherwise.
//
// Heuristics:
//
//	spec: has top-level opgl_version, OR properties.names is a map of [lang]
//	      → array of strings.
//	ui:   has top-level names map of [lang] → {canonical, aliases}, OR rel
//	      array at top level.
func detectShape(doc map[string]any) string {
	if _, ok := doc["opgl_version"]; ok {
		return "spec"
	}
	if props, ok := doc["properties"].(map[string]any); ok {
		if names, ok := props["names"].(map[string]any); ok {
			for _, v := range names {
				if _, isArr := v.([]any); isArr {
					return "spec"
				}
			}
		}
	}
	if names, ok := doc["names"].(map[string]any); ok {
		for _, v := range names {
			if entry, isMap := v.(map[string]any); isMap {
				if _, hasCanonical := entry["canonical"]; hasCanonical {
					return "ui"
				}
			}
		}
	}
	if _, ok := doc["rel"]; ok {
		return "ui"
	}
	// Fallback: if it has slug + kind + a names map of any shape, treat as ui.
	if _, hasSlug := doc["slug"].(string); hasSlug {
		if _, hasKind := doc["kind"].(string); hasKind {
			if _, hasNames := doc["names"]; hasNames {
				return "ui"
			}
		}
	}
	return "unknown"
}

var _ = errors.New // keep imports stable across edits
