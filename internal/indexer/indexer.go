// Package indexer ports _Proto-Commons/mock/scripts/generate-indexes.py to Go
// (OPG-L 0.6 Index & Bundle Data-Format Addendum 1.0).
//
// It loads an authored category skeleton (indexes/categories/<id>.json) and a
// primitives/ corpus (each primitive may carry properties.taxonomy) and produces
// the derived index projections:
//
//   - manifest.json:        format_version + language set + shards
//   - resolve/<lang>.json:  cross-lingual denormalized lookup ({format_version, entries})
//   - taxonomy/<lang>.json: rendered category tree with attached primitive members
//
// Output is byte-identical to the Python reference when run against the canonical
// mock corpus (the --dry-run drift gate). Determinism rules: 2-space indent,
// UTF-8 no escaping of <>&, sorted map keys, trailing newline. Struct field order
// reproduces the Python dict insertion order; map keys are emitted sorted by Go's
// encoding/json (== Python sorted() for the UTF-8/codepoint keys used here).
package indexer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

// FormatVersion is the addendum version stamped on every derived index file.
const FormatVersion = "1.0"

// DefaultLang is the fallback language for localized display (render fallback
// chain: active -> DefaultLang -> raw id/slug).
const DefaultLang = "en"

// Category is an authored index-native taxonomy node (indexes/categories/<id>.json).
// It is NOT a primitive and carries no content_hash/lineage.
type Category struct {
	FormatVersion string              `json:"format_version"`
	ID            string              `json:"id"`
	Names         map[string][]string `json:"names"`
	Specializes   string              `json:"specializes,omitempty"` // parent id (forest edge)
	Related       []string            `json:"related,omitempty"`     // discovery cross-refs
	ChildOrder    []string            `json:"child_order,omitempty"` // curated child id order
}

// Item carries a primitive's parsed JSON + the path relative to the corpus root.
type Item struct {
	Path string         // relative to corpus root, posix-style (e.g. primitives/tools/awl.json)
	Doc  map[string]any // parsed primitive
}

// ── resolve projection shapes ───────────────────────────────────────────────

// Entry is a single denormalized, self-sufficient resolve entry.
type Entry struct {
	Ref       string  `json:"ref"`            // categories/<id> | primitives/<kind>s/<slug>.json
	Class     string  `json:"class"`          // "category" | "primitive"
	Kind      *string `json:"kind"`           // six-kind for primitives; null for categories
	Name      string  `json:"name"`           // matched surface name (un-normalized)
	Lang      string  `json:"lang"`           // source language of this name
	Canonical bool    `json:"canonical"`      // derived from names.<lang>[0]
}

// ResolveFile is one resolve/<lang>.json.
type ResolveFile struct {
	FormatVersion string             `json:"format_version"`
	Entries       map[string][]Entry `json:"entries"`
}

// ── taxonomy projection shapes ──────────────────────────────────────────────

// Member is a primitive attached to a category in the rendered tree.
type Member struct {
	Ref  string `json:"ref"`
	Slug string `json:"slug"`
	Kind string `json:"kind"`
	Name string `json:"name"`
}

// TaxNode is a node in the per-language taxonomy tree.
type TaxNode struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Parent   *string   `json:"parent"`
	Members  []Member  `json:"members"`
	Related  []string  `json:"related"`
	Children []TaxNode `json:"children"`
}

// TaxonomyFile is one taxonomy/<lang>.json.
type TaxonomyFile struct {
	FormatVersion string             `json:"format_version"`
	Tree          map[string]TaxNode `json:"tree"`
}

// ── manifest ────────────────────────────────────────────────────────────────

// Shard is a manifest composition seam entry (degenerate single shard in v1).
type Shard struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

// Manifest is indexes/manifest.json.
type Manifest struct {
	FormatVersion string   `json:"format_version"`
	Languages     []string `json:"languages"`
	Shards        []Shard  `json:"shards"`
}

// ── loading ─────────────────────────────────────────────────────────────────

func loadJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// LoadCategories reads indexes/categories/*.json into {id: Category}.
func LoadCategories(root string) (map[string]Category, error) {
	dir := filepath.Join(root, "indexes", "categories")
	cats := map[string]Category{}
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return cats, nil // no skeleton yet
		}
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		var c Category
		if err := loadJSON(filepath.Join(dir, e.Name()), &c); err != nil {
			return nil, fmt.Errorf("parse category %s: %w", e.Name(), err)
		}
		cats[c.ID] = c
	}
	return cats, nil
}

// LoadCorpus walks primitivesDir and returns all primitives, sorted by path.
func LoadCorpus(corpusRoot, primitivesDir string) ([]Item, error) {
	var items []Item
	walkRoot := filepath.Join(corpusRoot, primitivesDir)
	err := filepath.WalkDir(walkRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || filepath.Ext(path) != ".json" {
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
		rel, err := filepath.Rel(corpusRoot, path)
		if err != nil {
			return err
		}
		items = append(items, Item{Path: filepath.ToSlash(rel), Doc: doc})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Path < items[j].Path })
	return items, nil
}

// ObservedLanguages is the union of all languages in category + primitive names.
func ObservedLanguages(cats map[string]Category, corpus []Item) []string {
	set := map[string]bool{}
	for _, c := range cats {
		for lang := range c.Names {
			set[lang] = true
		}
	}
	for _, it := range corpus {
		for lang := range primitiveNames(it) {
			set[lang] = true
		}
	}
	langs := make([]string, 0, len(set))
	for l := range set {
		langs = append(langs, l)
	}
	sort.Strings(langs)
	return langs
}

// ── normalization (carried from spec §A.6, unchanged) ───────────────────────

var fold = cases.Fold()

// NormalizeKey applies the resolve-index key contract (addendum §A.6):
//
//	NFC -> Unicode full case fold (CaseFolding.txt) -> NFC -> whitespace-collapse -> trim
//
// Case folding (golang.org/x/text/cases.Fold) — not strings.ToLower — is what
// makes the key cross-implementation deterministic. The vectors in
// testdata/normalization-vectors.json pin this byte-for-byte across impls.
func NormalizeKey(s string) string {
	nfc := norm.NFC.String(s)
	folded := fold.String(nfc)
	refolded := norm.NFC.String(folded)
	return strings.Join(strings.Fields(refolded), " ")
}

// ── validation ──────────────────────────────────────────────────────────────

// ValidateSkeleton checks specializes/related id-resolution and that specializes
// forms a forest (no cycles). Returns a sorted list of error messages.
func ValidateSkeleton(cats map[string]Category) []string {
	var errs []string
	for cid, c := range cats {
		if c.Specializes != "" {
			if _, ok := cats[c.Specializes]; !ok {
				errs = append(errs, fmt.Sprintf("category %s: specializes-parent %q not found", cid, c.Specializes))
			}
		}
		for _, r := range c.Related {
			if _, ok := cats[r]; !ok {
				errs = append(errs, fmt.Sprintf("category %s: related target %q not found", cid, r))
			}
		}
	}
	// Forest / cycle detection over specializes (id-joined).
	for cid := range cats {
		seen := map[string]bool{}
		cur := cid
		for {
			c, ok := cats[cur]
			if !ok || c.Specializes == "" {
				break
			}
			cur = c.Specializes
			if seen[cur] || cur == cid {
				errs = append(errs, fmt.Sprintf("specializes cycle detected through %s", cid))
				break
			}
			seen[cur] = true
		}
	}
	sort.Strings(errs)
	return errs
}

// ValidateMembership checks that every primitive's properties.taxonomy (when
// present) resolves to a known category id.
func ValidateMembership(cats map[string]Category, corpus []Item) []string {
	var errs []string
	for _, it := range corpus {
		tax := primitiveTaxonomy(it)
		if tax == "" {
			continue
		}
		if _, ok := cats[tax]; !ok {
			slug, _ := it.Doc["slug"].(string)
			errs = append(errs, fmt.Sprintf("%s: properties.taxonomy %q is not a known category", slug, tax))
		}
	}
	sort.Strings(errs)
	return errs
}

// ── resolve build ───────────────────────────────────────────────────────────

// BuildResolve builds {lang: ResolveFile}. Entries are denormalized and indexed
// for BOTH categories and primitives; values are always lists.
func BuildResolve(cats map[string]Category, corpus []Item) map[string]ResolveFile {
	byLang := map[string]map[string][]Entry{}

	add := func(lang, name string, i int, seen map[string]bool, make func() Entry) {
		key := NormalizeKey(name)
		if key == "" || seen[key] {
			return
		}
		seen[key] = true
		if byLang[lang] == nil {
			byLang[lang] = map[string][]Entry{}
		}
		byLang[lang][key] = append(byLang[lang][key], make())
	}

	for cid, c := range cats {
		ref := "categories/" + cid
		for lang, nameList := range c.Names {
			seen := map[string]bool{}
			for i, name := range nameList {
				lang, name, i := lang, name, i
				add(lang, name, i, seen, func() Entry {
					return Entry{Ref: ref, Class: "category", Kind: nil, Name: name, Lang: lang, Canonical: i == 0}
				})
			}
		}
	}
	for _, it := range corpus {
		path := it.Path
		kind, _ := it.Doc["kind"].(string)
		k := kind
		for lang, nameList := range primitiveNames(it) {
			seen := map[string]bool{}
			for i, name := range nameList {
				lang, name, i := lang, name, i
				add(lang, name, i, seen, func() Entry {
					kk := k
					return Entry{Ref: path, Class: "primitive", Kind: &kk, Name: name, Lang: lang, Canonical: i == 0}
				})
			}
		}
	}

	out := map[string]ResolveFile{}
	for lang, keys := range byLang {
		entries := make(map[string][]Entry, len(keys))
		for key, lst := range keys {
			sortEntries(lst)
			entries[key] = lst
		}
		out[lang] = ResolveFile{FormatVersion: FormatVersion, Entries: entries}
	}
	return out
}

// sortEntries orders a key's entry list by (ref, lang, !canonical, name),
// matching the Python reference.
func sortEntries(es []Entry) {
	sort.SliceStable(es, func(i, j int) bool {
		a, b := es[i], es[j]
		if a.Ref != b.Ref {
			return a.Ref < b.Ref
		}
		if a.Lang != b.Lang {
			return a.Lang < b.Lang
		}
		if a.Canonical != b.Canonical {
			return a.Canonical // canonical (true) sorts before alias (false)
		}
		return a.Name < b.Name
	})
}

// ── taxonomy build ──────────────────────────────────────────────────────────

// BuildTaxonomy renders {lang: TaxonomyFile} from the skeleton + attached members.
func BuildTaxonomy(cats map[string]Category, corpus []Item, langs []string) map[string]TaxonomyFile {
	childrenOf := map[string][]string{}
	var roots []string
	for cid, c := range cats {
		if c.Specializes == "" {
			roots = append(roots, cid)
		} else {
			childrenOf[c.Specializes] = append(childrenOf[c.Specializes], cid)
		}
	}
	sort.Strings(roots)

	relatedOf := map[string]map[string]bool{}
	addRel := func(a, b string) {
		if relatedOf[a] == nil {
			relatedOf[a] = map[string]bool{}
		}
		relatedOf[a][b] = true
	}
	for cid, c := range cats {
		for _, r := range c.Related {
			addRel(cid, r)
			addRel(r, cid) // surfaced both ways
		}
	}

	membersOf := map[string][]Item{}
	for _, it := range corpus {
		if tax := primitiveTaxonomy(it); tax != "" {
			membersOf[tax] = append(membersOf[tax], it)
		}
	}

	relatedSorted := func(cid string) []string {
		out := []string{}
		for r := range relatedOf[cid] {
			out = append(out, r)
		}
		sort.Strings(out)
		return out
	}

	orderedChildren := func(cid string) []string {
		kids := append([]string(nil), childrenOf[cid]...)
		kidSet := map[string]bool{}
		for _, k := range kids {
			kidSet[k] = true
		}
		var listed []string
		listedSet := map[string]bool{}
		for _, k := range cats[cid].ChildOrder {
			if kidSet[k] {
				listed = append(listed, k)
				listedSet[k] = true
			}
		}
		var rest []string
		for _, k := range kids {
			if !listedSet[k] {
				rest = append(rest, k)
			}
		}
		sort.Strings(rest)
		return append(listed, rest...) // curated order ahead of id order
	}

	memberRefs := func(cid, lang string) []Member {
		items := append([]Item(nil), membersOf[cid]...)
		sort.Slice(items, func(i, j int) bool {
			si, _ := items[i].Doc["slug"].(string)
			sj, _ := items[j].Doc["slug"].(string)
			return si < sj
		})
		out := []Member{}
		for _, it := range items {
			slug, _ := it.Doc["slug"].(string)
			kind, _ := it.Doc["kind"].(string)
			topName, _ := it.Doc["name"].(string)
			out = append(out, Member{
				Ref:  it.Path,
				Slug: slug,
				Kind: kind,
				Name: localized(primitiveNames(it), topName, slug, lang),
			})
		}
		return out
	}

	var node func(cid, lang string, parent *string) TaxNode
	node = func(cid, lang string, parent *string) TaxNode {
		children := []TaxNode{}
		pid := cid
		for _, k := range orderedChildren(cid) {
			p := pid
			children = append(children, node(k, lang, &p))
		}
		return TaxNode{
			ID:       cid,
			Name:     localized(cats[cid].Names, "", cid, lang),
			Parent:   parent,
			Members:  memberRefs(cid, lang),
			Related:  relatedSorted(cid),
			Children: children,
		}
	}

	out := map[string]TaxonomyFile{}
	for _, lang := range langs {
		tree := map[string]TaxNode{}
		for _, cid := range roots {
			tree["category/"+cid] = node(cid, lang, nil)
		}
		out[lang] = TaxonomyFile{FormatVersion: FormatVersion, Tree: tree}
	}
	return out
}

// ── manifest build ──────────────────────────────────────────────────────────

// BuildManifest returns the single-shard v1 manifest for the given languages.
func BuildManifest(langs []string) Manifest {
	return Manifest{
		FormatVersion: FormatVersion,
		Languages:     langs,
		Shards:        []Shard{{ID: "main", Path: "."}},
	}
}

// ── shared helpers ──────────────────────────────────────────────────────────

// primitiveNames reads properties.names as {lang: [names...]}.
func primitiveNames(it Item) map[string][]string {
	props, _ := it.Doc["properties"].(map[string]any)
	raw, _ := props["names"].(map[string]any)
	if raw == nil {
		return nil
	}
	out := make(map[string][]string, len(raw))
	for lang, v := range raw {
		arr, ok := v.([]any)
		if !ok {
			continue
		}
		names := make([]string, 0, len(arr))
		for _, n := range arr {
			if s, ok := n.(string); ok {
				names = append(names, s)
			}
		}
		out[lang] = names
	}
	return out
}

// primitiveTaxonomy reads properties.taxonomy (the category-membership id).
func primitiveTaxonomy(it Item) string {
	props, _ := it.Doc["properties"].(map[string]any)
	tax, _ := props["taxonomy"].(string)
	return tax
}

// localized resolves a display label: active language -> DefaultLang -> top name
// -> fallback id/slug.
func localized(names map[string][]string, topName, fallbackID, lang string) string {
	if arr := names[lang]; len(arr) > 0 {
		return arr[0]
	}
	if arr := names[DefaultLang]; len(arr) > 0 {
		return arr[0]
	}
	if topName != "" {
		return topName
	}
	return fallbackID
}

// ── output ──────────────────────────────────────────────────────────────────

// marshalCanonical emits deterministic JSON matching the Python reference:
// 2-space indent, sorted map keys, no <>& escaping, one trailing newline.
func marshalCanonical(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil // Encode appends exactly one trailing newline
}

// WriteFile writes one index artifact deterministically.
func WriteFile(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := marshalCanonical(v)
	if err != nil {
		return fmt.Errorf("marshal %s: %w", path, err)
	}
	return os.WriteFile(path, data, 0o644)
}

// WriteManifest writes indexes/manifest.json.
func WriteManifest(root string, m Manifest) error {
	return WriteFile(filepath.Join(root, "indexes", "manifest.json"), m)
}

// Regenerate loads the category skeleton from root and (re)writes the full
// derived index set — manifest.json + resolve/<lang>.json + taxonomy/<lang>.json
// — for the given primitive corpus. It is the high-level entry point used by the
// write/intake paths after a corpus mutation.
func Regenerate(root string, corpus []Item) error {
	cats, err := LoadCategories(root)
	if err != nil {
		return fmt.Errorf("load categories: %w", err)
	}
	langs := ObservedLanguages(cats, corpus)
	if err := WriteManifest(root, BuildManifest(langs)); err != nil {
		return err
	}
	if err := WritePerLang(filepath.Join(root, "indexes", "resolve"), BuildResolve(cats, corpus)); err != nil {
		return err
	}
	return WritePerLang(filepath.Join(root, "indexes", "taxonomy"), BuildTaxonomy(cats, corpus, langs))
}

// WritePerLang writes one <lang>.json per entry under targetDir.
func WritePerLang[T any](targetDir string, indexes map[string]T) error {
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return err
	}
	for lang, obj := range indexes {
		if err := WriteFile(filepath.Join(targetDir, lang+".json"), obj); err != nil {
			return err
		}
	}
	return nil
}
