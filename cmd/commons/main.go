// Command commons is the desktop maintainer tool for the OPG-L Proto-Commons.
//
// Subcommands:
//   commons              start the HTTP server (default) and open a browser
//   commons verify-mock  validate a mock corpus against the validator + indexer
//   commons version      print version and exit
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/Skund404/commons-tool/internal/api"
	"github.com/Skund404/commons-tool/internal/federation"
	gh "github.com/Skund404/commons-tool/internal/github"
	"github.com/Skund404/commons-tool/internal/indexer"
	"github.com/Skund404/commons-tool/internal/keychain"
	"github.com/Skund404/commons-tool/internal/schema"
	"github.com/Skund404/commons-tool/internal/state"
	"github.com/Skund404/commons-tool/internal/version"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "verify-mock":
			os.Exit(runVerifyMock(os.Args[2:]))
		case "version", "-v", "--version":
			fmt.Println("commons", version.Version)
			os.Exit(0)
		case "-h", "--help", "help":
			printUsage()
			os.Exit(0)
		}
	}
	os.Exit(runServer(os.Args[1:]))
}

func printUsage() {
	fmt.Fprint(os.Stderr, `commons — desktop maintainer tool for the OPG-L Proto-Commons

Usage:
  commons                       start HTTP server on 127.0.0.1, open browser
  commons --port=8430           override default port
  commons --no-browser          skip the auto-open
  commons verify-mock --mock D  validate a mock corpus directory
  commons version               print version and exit
`)
}

// runVerifyMock loads a mock corpus, runs the validator on every primitive +
// bundle, re-runs the indexer, and byte-compares the regenerated indexes
// against the committed indexes/ on disk.
func runVerifyMock(args []string) int {
	fs := flag.NewFlagSet("verify-mock", flag.ContinueOnError)
	mockDir := fs.String("mock", "../Rillmark/_Proto-Commons/mock", "path to mock corpus root")
	dryRun := fs.Bool("dry-run", true, "compare against committed indexes without writing")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	root, err := filepath.Abs(*mockDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "verify-mock: cannot resolve mock path:", err)
		return 2
	}

	fmt.Printf("Walking %s ...\n", filepath.Join(root, "primitives"))
	corpus, err := indexer.LoadCorpus(root, "primitives")
	if err != nil {
		fmt.Fprintln(os.Stderr, "verify-mock: load corpus:", err)
		return 1
	}
	fmt.Printf("  loaded %d primitives\n", len(corpus))

	totalErrs := 0
	for _, it := range corpus {
		blob, err := json.Marshal(it.Doc)
		if err != nil {
			fmt.Fprintf(os.Stderr, "  %s: re-marshal: %v\n", it.Path, err)
			totalErrs++
			continue
		}
		var p schema.Primitive
		if err := json.Unmarshal(blob, &p); err != nil {
			fmt.Fprintf(os.Stderr, "  %s: re-parse: %v\n", it.Path, err)
			totalErrs++
			continue
		}
		for _, e := range schema.ValidatePrimitive(&p) {
			fmt.Fprintf(os.Stderr, "  %s: %v\n", it.Path, e)
			totalErrs++
		}
	}
	if totalErrs > 0 {
		fmt.Fprintf(os.Stderr, "validator: %d issue(s)\n", totalErrs)
		return 1
	}
	fmt.Printf("  validator: clean across %d primitives\n", len(corpus))

	fmt.Println("Detecting specializes cycles ...")
	if cycErrs := indexer.DetectCycles(corpus); len(cycErrs) > 0 {
		for _, e := range cycErrs {
			fmt.Fprintf(os.Stderr, "  ERROR: %s\n", e)
		}
		return 1
	}
	fmt.Println("  no cycles, all specializes-parents resolve")

	bundleErrs, err := verifyBundles(root, corpus)
	if err != nil {
		fmt.Fprintln(os.Stderr, "verify-mock: bundles:", err)
		return 1
	}
	if len(bundleErrs) > 0 {
		for _, e := range bundleErrs {
			fmt.Fprintf(os.Stderr, "  ERROR: %s\n", e)
		}
		return 1
	}
	fmt.Println("  bundle hash refs resolve")

	fmt.Println("Building resolution indexes ...")
	resolveIdx := indexer.BuildResolveIndexes(corpus)
	for lang, e := range resolveIdx {
		fmt.Printf("  %s: %d keys\n", lang, len(e))
	}

	fmt.Println("Building taxonomy indexes ...")
	taxIdx := indexer.BuildTaxonomyIndexes(corpus)
	for lang, t := range taxIdx {
		fmt.Printf("  %s: %d root nodes\n", lang, len(t))
	}

	if !*dryRun {
		fmt.Println("Writing resolution indexes ...")
		if err := indexer.WriteIndexes(filepath.Join(root, "indexes", "resolve"), resolveIdx); err != nil {
			fmt.Fprintln(os.Stderr, "  write resolve:", err)
			return 1
		}
		fmt.Println("Writing taxonomy indexes ...")
		if err := indexer.WriteIndexes(filepath.Join(root, "indexes", "taxonomy"), taxIdx); err != nil {
			fmt.Fprintln(os.Stderr, "  write taxonomy:", err)
			return 1
		}
		fmt.Println("Done.")
		return 0
	}

	fmt.Println("\n--dry-run: comparing with committed indexes ...")
	divergedR := compareIndexes(filepath.Join(root, "indexes", "resolve"), resolveIdx)
	divergedT := compareIndexes(filepath.Join(root, "indexes", "taxonomy"), taxIdx)
	if len(divergedR)+len(divergedT) > 0 {
		fmt.Fprintln(os.Stderr, "  DIVERGED:")
		for _, d := range append(divergedR, divergedT...) {
			fmt.Fprintln(os.Stderr, "    "+d)
		}
		return 2
	}
	fmt.Println("  all indexes match committed versions")
	return 0
}

func verifyBundles(root string, corpus []indexer.Item) ([]string, error) {
	knownHashes := map[string]bool{}
	for _, it := range corpus {
		if h, ok := it.Doc["content_hash"].(string); ok {
			knownHashes[h] = true
		}
	}
	bundlesDir := filepath.Join(root, "indexes", "bundles")
	entries, err := os.ReadDir(bundlesDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var errs []string
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		path := filepath.Join(bundlesDir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var b schema.Bundle
		if err := json.Unmarshal(data, &b); err != nil {
			errs = append(errs, fmt.Sprintf("%s: parse: %v", e.Name(), err))
			continue
		}
		for _, v := range schema.ValidateBundle(&b) {
			errs = append(errs, fmt.Sprintf("%s: %v", e.Name(), v))
		}
		for i, it := range b.Items {
			if it.RecordClass == "primitive" && !knownHashes[it.Hash] {
				errs = append(errs,
					fmt.Sprintf("%s: item[%d] pins unknown hash %s (slug=%s)",
						e.Name(), i, it.Hash, it.Slug))
			}
		}
	}
	return errs, nil
}

func compareIndexes[T any](dir string, generated map[string]T) []string {
	var diverged []string
	for lang, entries := range generated {
		path := filepath.Join(dir, lang+".json")
		data, err := os.ReadFile(path)
		if err != nil {
			diverged = append(diverged, fmt.Sprintf("%s (missing)", filepath.Base(path)))
			continue
		}
		var committed any
		if err := json.Unmarshal(data, &committed); err != nil {
			diverged = append(diverged, fmt.Sprintf("%s (parse error)", filepath.Base(path)))
			continue
		}
		// Re-marshal generated to the same canonical form as the committed file
		// so we compare normalized JSON, not pointer-equal Go values.
		gen, err := json.Marshal(entries)
		if err != nil {
			diverged = append(diverged, fmt.Sprintf("%s (marshal error)", filepath.Base(path)))
			continue
		}
		var genNorm any
		if err := json.Unmarshal(gen, &genNorm); err != nil {
			diverged = append(diverged, fmt.Sprintf("%s (unmarshal-roundtrip error)", filepath.Base(path)))
			continue
		}
		if !deepEqualJSON(committed, genNorm) {
			diverged = append(diverged, filepath.Join(filepath.Base(dir), filepath.Base(path)))
		}
	}
	return diverged
}

// deepEqualJSON compares two values that came from json.Unmarshal into any.
// It treats numeric equality strictly (Go json defaults to float64 for numbers).
func deepEqualJSON(a, b any) bool {
	switch ax := a.(type) {
	case map[string]any:
		bx, ok := b.(map[string]any)
		if !ok || len(ax) != len(bx) {
			return false
		}
		for k, v := range ax {
			bv, ok := bx[k]
			if !ok || !deepEqualJSON(v, bv) {
				return false
			}
		}
		return true
	case []any:
		bx, ok := b.([]any)
		if !ok || len(ax) != len(bx) {
			return false
		}
		for i := range ax {
			if !deepEqualJSON(ax[i], bx[i]) {
				return false
			}
		}
		return true
	default:
		return a == b
	}
}

// runServer starts the local HTTP API on 127.0.0.1 and (optionally) opens a browser.
func runServer(args []string) int {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	port := fs.Int("port", 8430, "port to bind on 127.0.0.1")
	noBrowser := fs.Bool("no-browser", false, "do not open the browser on start")
	mockDir := fs.String("mock", "../Rillmark/_Proto-Commons/mock", "path to a corpus root the server should serve")
	suggestionsDir := fs.String("suggestions", "../Rillmark/_Proto-Commons/suggestions", "path to the vault suggestions/ directory")
	commitMerge := fs.Bool("commit-merge", false, "actually run gh pr merge (default: dry-run, prints only)")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	root, err := filepath.Abs(*mockDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "serve: cannot resolve corpus path:", err)
		return 1
	}

	frontFS, ferr := frontendRoot()
	if ferr != nil {
		fmt.Fprintln(os.Stderr, "serve: frontend embed unavailable, serving API only:", ferr)
		frontFS = nil
	}

	srv2 := api.NewServer(root, *suggestionsDir)
	srv2.FrontendFS = frontFS

	// State (best-effort — if SQLite open fails we degrade to no persistence).
	if st, err := state.Open(""); err == nil {
		srv2.State = st
		defer st.Close()
	} else {
		fmt.Fprintln(os.Stderr, "warn: state store unavailable:", err)
	}

	srv2.Keychain = keychain.Default()

	if mgr, err := federation.New(""); err == nil {
		srv2.Federation = mgr
	} else {
		fmt.Fprintln(os.Stderr, "warn: federation manager unavailable:", err)
	}

	// Only wire the GitHub client if gh CLI is authed AND returns a
	// non-empty token. On GH Actions runners gh is pre-installed and
	// `gh auth token` exits 0 with an empty string when GH_TOKEN isn't set
	// — the empty-string check catches that case. Without this guard every
	// /api/prs call would spawn a `gh pr list` subprocess that fails with
	// an auth error, saturating goroutines on the runner.
	if tok, err := gh.TokenFromGh(); err == nil && tok != "" {
		srv2.GitHub = gh.New("", !*commitMerge, gh.TokenFromGh)
		srv2.GitHub.Log = os.Stderr
	} else {
		fmt.Fprintln(os.Stderr, "info: gh CLI unauthenticated; PR list will use fixtures only")
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%d", *port),
		Handler:           srv2.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		fmt.Printf("commons v%s listening on http://%s (corpus=%s)\n",
			version.Version, srv.Addr, root)
		if !*noBrowser {
			// best-effort browser launch (Windows specific stub; other OSes ignored
			// here to keep the dependency footprint zero for cross-compile).
		}
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintln(os.Stderr, "server:", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	fmt.Println("\nshutting down ...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	return 0
}
