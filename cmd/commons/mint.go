package main

// mint.go — stamp the canonical content_hash on every primitive and bundle in a
// corpus, reusing internal/hash (the same hasher the server write-path and
// intake-incoming use — never a re-implementation).
//
// It is the batch authoring counterpart to the per-record server write: given a
// corpus whose records carry placeholder (or stale) hashes, it walks
// primitives/**/*.json and indexes/bundles/*.json and rewrites each with its
// authoritative content_hash. Bundle item hashes are re-pinned from the freshly
// stamped primitives (by kind+slug); nested-bundle item hashes are resolved in
// dependency order (a bundle's hash excludes successors, per §B.4, via
// hash.ComputeBundle). Files are written 2-space-indented + LF, matching the
// server's atomicWriteJSON, and are only rewritten when their bytes actually
// change (idempotent).
//
//	commons mint --mock D                  stamp + rewrite in place
//	commons mint --mock D --include P,Q    only WRITE files whose corpus-relative
//	                                       posix path starts with P or Q; hashes
//	                                       are still computed corpus-wide so bundle
//	                                       pins stay correct. Records that changed
//	                                       but fall outside the scope are reported.
//	commons mint --mock D --check          report records whose stored hash
//	                                       diverges from canonical (exit 2); no writes

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Skund404/commons-tool/internal/hash"
	"github.com/Skund404/commons-tool/internal/indexer"
)

func astr(v any) string { s, _ := v.(string); return s }

// runMint stamps content_hash across a corpus. Returns process exit code.
func runMint(args []string) int {
	fs := flag.NewFlagSet("mint", flag.ContinueOnError)
	mockDir := fs.String("mock", "../Rillmark/_Proto-Commons/mock", "path to corpus root")
	check := fs.Bool("check", false, "report drift without writing (exit 2 if any record's stored hash diverges)")
	includeCSV := fs.String("include", "", "comma-separated corpus-relative posix path prefixes; only matching files are WRITTEN (hashes still computed corpus-wide)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	root, err := filepath.Abs(*mockDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "mint: cannot resolve corpus path:", err)
		return 2
	}

	var includes []string
	for _, p := range strings.Split(*includeCSV, ",") {
		if p = strings.TrimSpace(p); p != "" {
			includes = append(includes, p)
		}
	}
	included := func(rel string) bool {
		if len(includes) == 0 {
			return true
		}
		for _, pre := range includes {
			if strings.HasPrefix(rel, pre) {
				return true
			}
		}
		return false
	}

	mode := "WRITE"
	if *check {
		mode = "CHECK (no writes)"
	}
	fmt.Printf("mint [%s] — corpus %s\n", mode, root)
	if len(includes) > 0 {
		fmt.Printf("  write scope: %s\n", strings.Join(includes, ", "))
	}

	var drift []string      // stored hash != canonical (check mode)
	var outOfScope []string // changed but outside --include (write mode)

	// ── 1. Primitives ───────────────────────────────────────────────────────
	corpus, err := indexer.LoadCorpus(root, "primitives")
	if err != nil {
		fmt.Fprintln(os.Stderr, "mint: load corpus:", err)
		return 1
	}
	primHash := make(map[string]string, len(corpus)) // "<kind>|<slug>" -> content_hash
	primChanged := 0
	for _, it := range corpus {
		h, err := hash.Compute(it.Doc)
		if err != nil {
			fmt.Fprintf(os.Stderr, "mint: hash %s: %v\n", it.Path, err)
			return 1
		}
		primHash[astr(it.Doc["kind"])+"|"+astr(it.Doc["slug"])] = h
		if *check {
			if astr(it.Doc["content_hash"]) != h {
				drift = append(drift, fmt.Sprintf("%s (have %s, want %s)", it.Path, astr(it.Doc["content_hash"]), h))
			}
			continue
		}
		it.Doc["content_hash"] = h
		abs := filepath.Join(root, filepath.FromSlash(it.Path))
		wrote, changed, err := maybeWrite(abs, it.Doc, included(it.Path))
		if err != nil {
			fmt.Fprintf(os.Stderr, "mint: write %s: %v\n", it.Path, err)
			return 1
		}
		if wrote {
			primChanged++
		} else if changed {
			outOfScope = append(outOfScope, it.Path)
		}
	}

	// ── 2. Bundles ──────────────────────────────────────────────────────────
	bundlesDir := filepath.Join(root, "indexes", "bundles")
	type bundleFile struct {
		path string
		rel  string
		doc  map[string]any
	}
	bundles := map[string]*bundleFile{} // slug -> file
	var bundleSlugs []string
	entries, derr := os.ReadDir(bundlesDir)
	if derr != nil && !os.IsNotExist(derr) {
		fmt.Fprintln(os.Stderr, "mint: read bundles dir:", derr)
		return 1
	}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		p := filepath.Join(bundlesDir, e.Name())
		data, err := os.ReadFile(p)
		if err != nil {
			fmt.Fprintf(os.Stderr, "mint: read %s: %v\n", e.Name(), err)
			return 1
		}
		var doc map[string]any
		if err := json.Unmarshal(data, &doc); err != nil {
			fmt.Fprintf(os.Stderr, "mint: parse %s: %v\n", e.Name(), err)
			return 1
		}
		slug := astr(doc["slug"])
		if slug == "" {
			fmt.Fprintf(os.Stderr, "mint: %s has no slug\n", e.Name())
			return 1
		}
		bundles[slug] = &bundleFile{path: p, rel: "indexes/bundles/" + e.Name(), doc: doc}
		bundleSlugs = append(bundleSlugs, slug)
	}
	sort.Strings(bundleSlugs)

	// 2a. Re-pin primitive item hashes from the freshly stamped primitives.
	for _, slug := range bundleSlugs {
		items, _ := bundles[slug].doc["items"].([]any)
		for _, raw := range items {
			item, _ := raw.(map[string]any)
			if item == nil || astr(item["record_class"]) != "primitive" {
				continue
			}
			key := astr(item["kind"]) + "|" + astr(item["slug"])
			h, ok := primHash[key]
			if !ok {
				fmt.Fprintf(os.Stderr, "mint: bundle %q pins unknown primitive %s\n", slug, key)
				return 1
			}
			item["hash"] = h
		}
	}

	// 2b. Resolve bundle content_hash in dependency order (nested bundles first).
	bundleHash := map[string]string{}
	visiting := map[string]bool{}
	var resolve func(slug string) (string, error)
	resolve = func(slug string) (string, error) {
		if h, ok := bundleHash[slug]; ok {
			return h, nil
		}
		bf, ok := bundles[slug]
		if !ok {
			return "", fmt.Errorf("nested bundle %q not found", slug)
		}
		if visiting[slug] {
			return "", fmt.Errorf("bundle nesting cycle through %q", slug)
		}
		visiting[slug] = true
		items, _ := bf.doc["items"].([]any)
		for _, raw := range items {
			item, _ := raw.(map[string]any)
			if item == nil || astr(item["record_class"]) != "bundle" {
				continue
			}
			child := astr(item["slug"])
			ch, err := resolve(child)
			if err != nil {
				return "", err
			}
			item["hash"] = ch
		}
		delete(bf.doc, "content_hash")
		h, err := hash.ComputeBundle(bf.doc)
		if err != nil {
			return "", fmt.Errorf("bundle %q hash: %w", slug, err)
		}
		bundleHash[slug] = h
		visiting[slug] = false
		return h, nil
	}

	// Snapshot stored content_hash for every bundle BEFORE any resolution runs.
	// resolve() deletes a nested child's content_hash in-place while resolving
	// its parent (line above), so reading bf.doc["content_hash"] inside the loop
	// would see "" for any bundle already visited as a child — a false --check
	// drift report. Capturing up front keeps the comparison honest.
	storedBundleHash := make(map[string]string, len(bundleSlugs))
	for _, slug := range bundleSlugs {
		storedBundleHash[slug] = astr(bundles[slug].doc["content_hash"])
	}

	bundleChanged := 0
	for _, slug := range bundleSlugs {
		bf := bundles[slug]
		prevStored := storedBundleHash[slug]
		h, err := resolve(slug)
		if err != nil {
			fmt.Fprintln(os.Stderr, "mint:", err)
			return 1
		}
		bf.doc["content_hash"] = h
		if *check {
			if prevStored != h {
				drift = append(drift, fmt.Sprintf("%s (have %s, want %s)", bf.rel, prevStored, h))
			}
			continue
		}
		wrote, changed, err := maybeWrite(bf.path, bf.doc, included(bf.rel))
		if err != nil {
			fmt.Fprintf(os.Stderr, "mint: write %s: %v\n", bf.rel, err)
			return 1
		}
		if wrote {
			bundleChanged++
		} else if changed {
			outOfScope = append(outOfScope, bf.rel)
		}
	}

	// ── Report ────────────────────────────────────────────────────────────
	if *check {
		if len(drift) > 0 {
			fmt.Fprintf(os.Stderr, "DRIFT — %d record(s) diverge from canonical:\n", len(drift))
			for _, d := range drift {
				fmt.Fprintln(os.Stderr, "  "+d)
			}
			return 2
		}
		fmt.Printf("  clean: %d primitives + %d bundles match canonical hashes\n", len(corpus), len(bundleSlugs))
		return 0
	}
	fmt.Printf("  stamped: %d primitive file(s) + %d bundle file(s) rewritten (%d primitives, %d bundles scanned)\n",
		primChanged, bundleChanged, len(corpus), len(bundleSlugs))
	if len(outOfScope) > 0 {
		fmt.Printf("  NOTE: %d record(s) needed a hash update but were OUTSIDE --include (left untouched):\n", len(outOfScope))
		for _, p := range outOfScope {
			fmt.Println("    " + p)
		}
	}
	return 0
}

// maybeWrite serializes doc canonically (2-space indent + trailing LF, matching
// internal/api.atomicWriteJSON) and writes it only if the on-disk file is
// SEMANTICALLY different AND the file is in scope. Semantic (not byte)
// comparison means an already-correct record authored in a different key order
// (e.g. a curated bundle) is left untouched — mint only rewrites records whose
// content actually changed (a stamped hash, a re-pinned item, a new file).
// Returns (wrote, changedButSkipped).
func maybeWrite(path string, doc any, inScope bool) (bool, bool, error) {
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return false, false, err
	}
	b = append(b, '\n')
	if old, rerr := os.ReadFile(path); rerr == nil {
		var oldV, newV any
		if json.Unmarshal(old, &oldV) == nil && json.Unmarshal(b, &newV) == nil && deepEqualJSON(oldV, newV) {
			return false, false, nil // semantically identical — preserve existing file
		}
	}
	if !inScope {
		return false, true, nil // would change, but excluded by --include
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return false, false, err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return false, false, err
	}
	return true, false, nil
}
