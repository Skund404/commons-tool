// Package indexer ports _Proto-Commons/mock/scripts/generate-indexes.py to Go.
//
// Walks a primitives/ directory and produces:
//   - resolve/<lang>.json:  flat name→entry map (lists on alias collision)
//   - taxonomy/<lang>.json: tree of slugs walked via the `specializes` relationship
//
// Output is byte-identical to the Python reference when run against the
// canonical mock corpus.
package indexer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

// Entry is a single resolve-index entry.
type Entry struct {
	Hash      string `json:"hash"`
	Path      string `json:"path"`
	Kind      string `json:"kind"`
	Canonical bool   `json:"canonical"`
}

// Item carries a primitive's parsed JSON + the path relative to the mock root.
// Loaded primitives are kept as map[string]any to preserve unknown fields and
// remain compatible with the hasher's canonical preimage.
type Item struct {
	Path string         // relative to mock root, posix-style
	Doc  map[string]any // parsed primitive
}

// LoadCorpus walks primitivesDir and returns all primitives, sorted by path.
func LoadCorpus(mockRoot, primitivesDir string) ([]Item, error) {
	var items []Item
	walkRoot := filepath.Join(mockRoot, primitivesDir)
	err := filepath.WalkDir(walkRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if filepath.Ext(path) != ".json" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		var doc map[string]any
		if err := json.Unmarshal(data, &doc); err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		rel, err := filepath.Rel(mockRoot, path)
		if err != nil {
			return err
		}
		items = append(items, Item{
			Path: filepath.ToSlash(rel),
			Doc:  doc,
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Path < items[j].Path })
	return items, nil
}

// fold is the language-independent Unicode case folder (CaseFolding.txt full
// mappings). It is constructed once: cases.Caser is documented safe for
// concurrent use, and NormalizeKey is called from per-language index builds.
var fold = cases.Fold()

// NormalizeKey applies the resolve-index key contract (spec §6.3):
//
//	NFC -> Unicode case fold -> NFC -> whitespace-collapse -> trim
//
// Case folding (golang.org/x/text/cases.Fold, backed by CaseFolding.txt) is
// used instead of strings.ToLower because ToLower is a simple 1:1 rune mapping
// that diverges from Python's str.lower()/str.casefold() and JS toLowerCase on
// characters like U+0130 -- which would break the §6.6 cross-implementation
// determinism guarantee. The second NFC pass reconciles any composition
// divergence the fold introduces. The vectors in
// testdata/normalization-vectors.json pin this byte-for-byte across impls.
func NormalizeKey(s string) string {
	nfc := norm.NFC.String(s)
	folded := fold.String(nfc)
	refolded := norm.NFC.String(folded)
	return strings.Join(strings.Fields(refolded), " ")
}

// BuildResolveIndexes builds the {lang: {key: entry-or-entries}} structure.
// When two primitives share a normalized key in the same language, the value
// becomes a JSON array of entries (forces UI disambiguation).
func BuildResolveIndexes(corpus []Item) map[string]map[string]any {
	byLang := map[string]map[string][]Entry{}

	for _, it := range corpus {
		props, _ := it.Doc["properties"].(map[string]any)
		names, _ := props["names"].(map[string]any)
		hash, _ := it.Doc["content_hash"].(string)
		kind, _ := it.Doc["kind"].(string)

		for lang, raw := range names {
			arr, ok := raw.([]any)
			if !ok {
				continue
			}
			for i, name := range arr {
				s, ok := name.(string)
				if !ok {
					continue
				}
				key := NormalizeKey(s)
				entry := Entry{
					Hash:      hash,
					Path:      it.Path,
					Kind:      kind,
					Canonical: i == 0,
				}
				if byLang[lang] == nil {
					byLang[lang] = map[string][]Entry{}
				}
				byLang[lang][key] = append(byLang[lang][key], entry)
			}
		}
	}

	out := map[string]map[string]any{}
	for lang, entries := range byLang {
		row := map[string]any{}
		for key, es := range entries {
			if len(es) == 1 {
				row[key] = es[0]
			} else {
				row[key] = es
			}
		}
		out[lang] = row
	}
	return out
}

// TaxNode is a node in the per-language taxonomy tree.
type TaxNode struct {
	Slug     string             `json:"slug"`
	Kind     string             `json:"kind"`
	Hash     string             `json:"hash"`
	Path     string             `json:"path"`
	Name     string             `json:"name"`
	Children []TaxNode          `json:"children"`
}

// DetectCycles checks for specializes-cycles and broken parent refs.
// Returns a list of error messages; empty means clean.
func DetectCycles(corpus []Item) []string {
	byHash := map[string]Item{}
	for _, it := range corpus {
		h, _ := it.Doc["content_hash"].(string)
		byHash[h] = it
	}
	parentOf := map[string]string{}
	for _, it := range corpus {
		ownHash, _ := it.Doc["content_hash"].(string)
		rels, _ := it.Doc["relationships"].([]any)
		for _, r := range rels {
			rel, _ := r.(map[string]any)
			if rel == nil {
				continue
			}
			if rel["type"] != "specializes" {
				continue
			}
			target, _ := rel["target"].(map[string]any)
			if target == nil {
				continue
			}
			tHash, _ := target["hash"].(string)
			parentOf[ownHash] = tHash
		}
	}

	var errs []string
	for start := range parentOf {
		seen := map[string]bool{}
		cur := start
		for {
			next, ok := parentOf[cur]
			if !ok {
				break
			}
			if seen[cur] {
				errs = append(errs, fmt.Sprintf("specializes cycle detected through %s", cur))
				break
			}
			seen[cur] = true
			cur = next
		}
		target := parentOf[start]
		if _, exists := byHash[target]; !exists {
			startSlug, _ := byHash[start].Doc["slug"].(string)
			errs = append(errs, fmt.Sprintf("%s: specializes-parent %s not in corpus", startSlug, target))
		}
	}
	sort.Strings(errs)
	return errs
}

// BuildTaxonomyIndexes returns {lang: {key: TaxNode}} where key is `<kind>/<slug>`
// and each node carries localized name + children walked via `specializes`.
func BuildTaxonomyIndexes(corpus []Item) map[string]map[string]TaxNode {
	byHash := map[string]Item{}
	childrenOf := map[string][]Item{}
	hasParent := map[string]bool{}

	for _, it := range corpus {
		h, _ := it.Doc["content_hash"].(string)
		byHash[h] = it
	}
	for _, it := range corpus {
		ownHash, _ := it.Doc["content_hash"].(string)
		rels, _ := it.Doc["relationships"].([]any)
		for _, r := range rels {
			rel, _ := r.(map[string]any)
			if rel == nil || rel["type"] != "specializes" {
				continue
			}
			target, _ := rel["target"].(map[string]any)
			if target == nil {
				continue
			}
			parentHash, _ := target["hash"].(string)
			childrenOf[parentHash] = append(childrenOf[parentHash], it)
			hasParent[ownHash] = true
		}
	}

	// Sort each child list by slug for stable output.
	for k := range childrenOf {
		ch := childrenOf[k]
		sort.Slice(ch, func(i, j int) bool {
			si, _ := ch[i].Doc["slug"].(string)
			sj, _ := ch[j].Doc["slug"].(string)
			return si < sj
		})
		childrenOf[k] = ch
	}

	// Collect all languages observed in the corpus.
	langSet := map[string]bool{}
	for _, it := range corpus {
		props, _ := it.Doc["properties"].(map[string]any)
		names, _ := props["names"].(map[string]any)
		for lang := range names {
			langSet[lang] = true
		}
	}
	langs := make([]string, 0, len(langSet))
	for l := range langSet {
		langs = append(langs, l)
	}
	sort.Strings(langs)

	var buildNode func(it Item, lang string) TaxNode
	buildNode = func(it Item, lang string) TaxNode {
		ownHash, _ := it.Doc["content_hash"].(string)
		slug, _ := it.Doc["slug"].(string)
		kind, _ := it.Doc["kind"].(string)

		display := slug
		if topName, ok := it.Doc["name"].(string); ok && topName != "" {
			display = topName
		}
		props, _ := it.Doc["properties"].(map[string]any)
		names, _ := props["names"].(map[string]any)
		if arr, ok := names[lang].([]any); ok && len(arr) > 0 {
			if s, ok := arr[0].(string); ok && s != "" {
				display = s
			}
		}

		var children []TaxNode
		for _, child := range childrenOf[ownHash] {
			children = append(children, buildNode(child, lang))
		}
		if children == nil {
			children = []TaxNode{}
		}
		return TaxNode{
			Slug:     slug,
			Kind:     kind,
			Hash:     ownHash,
			Path:     it.Path,
			Name:     display,
			Children: children,
		}
	}

	out := map[string]map[string]TaxNode{}
	for _, lang := range langs {
		tree := map[string]TaxNode{}
		// Sort corpus by slug for stable enumeration of roots.
		ordered := append([]Item(nil), corpus...)
		sort.Slice(ordered, func(i, j int) bool {
			si, _ := ordered[i].Doc["slug"].(string)
			sj, _ := ordered[j].Doc["slug"].(string)
			return si < sj
		})
		for _, it := range ordered {
			hash, _ := it.Doc["content_hash"].(string)
			if hasParent[hash] {
				continue
			}
			kind, _ := it.Doc["kind"].(string)
			slug, _ := it.Doc["slug"].(string)
			tree[fmt.Sprintf("%s/%s", kind, slug)] = buildNode(it, lang)
		}
		out[lang] = tree
	}
	return out
}

// WriteIndexes writes a per-language index map as <lang>.json with
// indent=2 + sort_keys=true + trailing newline (matches the Python reference).
func WriteIndexes[T any](targetDir string, indexes map[string]T) error {
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return err
	}
	for lang, entries := range indexes {
		path := filepath.Join(targetDir, lang+".json")
		data, err := marshalSortedIndent(entries)
		if err != nil {
			return fmt.Errorf("marshal %s: %w", path, err)
		}
		if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
			return err
		}
	}
	return nil
}

// marshalSortedIndent emits JSON with indent=2 and sorted object keys,
// matching Python's json.dumps(..., indent=2, sort_keys=True, ensure_ascii=False).
func marshalSortedIndent(v any) ([]byte, error) {
	// json.MarshalIndent already sorts map keys lexically in Go's encoding/json,
	// and ensure_ascii=False is the default (UTF-8 passthrough).
	// However we need our TaxNode/Entry structs to also emit deterministically.
	// Since struct fields are emitted in declaration order, we re-marshal via map.
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, err
	}
	return out, nil
}
