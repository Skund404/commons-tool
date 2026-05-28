package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	gogit "github.com/go-git/go-git/v5"

	commonsdiff "github.com/Skund404/commons-tool/internal/diff"
	"github.com/Skund404/commons-tool/internal/federation"
	commonsgit "github.com/Skund404/commons-tool/internal/git"
	gh "github.com/Skund404/commons-tool/internal/github"
	"github.com/Skund404/commons-tool/internal/indexer"
	"github.com/Skund404/commons-tool/internal/schema"
	"github.com/Skund404/commons-tool/internal/version"
)

// ─────────── health + status ───────────

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"ok":      true,
		"version": version.Version,
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	bundles, _ := readBundles(s.CorpusRoot)
	prs, _ := commonsdiff.LoadFixturePRs()

	cycErrs := indexer.DetectCycles(corpus)
	out := map[string]any{
		"corpus_root":    s.CorpusRoot,
		"primitives":     len(corpus),
		"bundles":        len(bundles),
		"open_prs":       len(prs),
		"cycle_errors":   cycErrs,
		"validator_ok":   len(cycErrs) == 0,
		"last_validated": time.Now().UTC().Format(time.RFC3339),
	}
	if s.State != nil {
		if lv, _ := s.State.LastValidation(); lv != nil {
			out["last_validation_db"] = lv
		}
	}
	writeJSON(w, 200, out)
}

// ─────────── primitives ───────────

func (s *Server) handlePrimitivesList(w http.ResponseWriter, r *http.Request) {
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(corpus))
	for _, it := range corpus {
		out = append(out, projectPrimitiveToUI(it))
	}
	writeJSON(w, 200, out)
}

func (s *Server) handlePrimitiveDetail(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	for _, it := range corpus {
		if s, _ := it.Doc["slug"].(string); s == slug {
			writeJSON(w, 200, projectPrimitiveToUI(it))
			return
		}
	}
	writeError(w, 404, "primitive not found")
	_ = slug
}

// ─────────── indexes ───────────

func (s *Server) handleResolveIndexes(w http.ResponseWriter, r *http.Request) {
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, indexer.BuildResolveIndexes(corpus))
}

func (s *Server) handleTaxonomyIndexes(w http.ResponseWriter, r *http.Request) {
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, indexer.BuildTaxonomyIndexes(corpus))
}

func (s *Server) handleRegenIndexes(w http.ResponseWriter, r *http.Request) {
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	resolveIdx := indexer.BuildResolveIndexes(corpus)
	taxIdx := indexer.BuildTaxonomyIndexes(corpus)
	if err := indexer.WriteIndexes(filepath.Join(s.CorpusRoot, "indexes", "resolve"), resolveIdx); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if err := indexer.WriteIndexes(filepath.Join(s.CorpusRoot, "indexes", "taxonomy"), taxIdx); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"ok":     true,
		"resolve": map[string]int{"languages": len(resolveIdx)},
		"taxonomy": map[string]int{"languages": len(taxIdx)},
	})
}

// ─────────── bundles ───────────

func (s *Server) handleBundlesList(w http.ResponseWriter, r *http.Request) {
	docs, err := readBundles(s.CorpusRoot)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(docs))
	for _, d := range docs {
		out = append(out, projectBundleToUI(d))
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleBundleGet(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	doc, err := readBundle(s.CorpusRoot, slug)
	if err != nil {
		writeError(w, 404, "bundle not found")
		return
	}
	writeJSON(w, 200, projectBundleToUI(doc))
}

func (s *Server) handleBundleCreate(w http.ResponseWriter, r *http.Request) {
	var doc map[string]any
	if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if _, ok := doc["record_class"]; !ok {
		doc["record_class"] = "bundle"
	}
	if err := writeBundle(s.CorpusRoot, doc); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, projectBundleToUI(doc))
}

func (s *Server) handleBundleUpdate(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	var doc map[string]any
	if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	doc["slug"] = slug
	if _, ok := doc["record_class"]; !ok {
		doc["record_class"] = "bundle"
	}
	if err := writeBundle(s.CorpusRoot, doc); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, projectBundleToUI(doc))
}

func (s *Server) handleBundleDelete(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	path := filepath.Join(s.CorpusRoot, "indexes", "bundles", slug+".json")
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			writeError(w, 404, "bundle not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ─────────── diff + recommend ───────────

// handleDiff returns a SemanticDiff for ?source={pr|local|refs} + params.
func (s *Server) handleDiff(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	source := q.Get("source")
	switch source {
	case "pr":
		num, _ := strconv.Atoi(q.Get("num"))
		prs, err := commonsdiff.LoadFixturePRs()
		if err != nil {
			writeError(w, 500, err.Error())
			return
		}
		for i := range prs {
			if prs[i].Number == num {
				writeJSON(w, 200, prs[i].ToDiff())
				return
			}
		}
		// Live path: fetch the PR head ref locally + DiffRefs.
		if s.GitHub == nil {
			writeError(w, 404, fmt.Sprintf("PR #%d not in fixtures and gh client not configured", num))
			return
		}
		sd, _, lerr := s.liveDiffFromPR(r.Context(), num)
		if lerr != nil {
			writeError(w, 502, lerr.Error())
			return
		}
		writeJSON(w, 200, sd)
	case "local":
		// Local diff requires being inside a git repo rooted at CorpusRoot.
		repo, err := commonsgit.Open(s.CorpusRoot)
		if err != nil {
			writeError(w, 400, "local diff requires CorpusRoot to be a git working tree: "+err.Error())
			return
		}
		sd, err := repo.DiffWorkingTree()
		if err != nil {
			writeError(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, sd)
	case "refs":
		base := q.Get("base")
		head := q.Get("head")
		if base == "" || head == "" {
			writeError(w, 400, "refs diff needs ?base= and ?head=")
			return
		}
		repo, err := commonsgit.Open(s.CorpusRoot)
		if err != nil {
			writeError(w, 400, err.Error())
			return
		}
		sd, err := repo.DiffRefs(base, head)
		if err != nil {
			writeError(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, sd)
	default:
		writeError(w, 400, "?source= must be pr | local | refs")
	}
}

func (s *Server) handleRecommend(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Diff   *commonsgit.SemanticDiff `json:"diff"`
		PRNum  int                      `json:"pr_num,omitempty"`
		Source string                   `json:"source,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err.Error() != "EOF" {
		writeError(w, 400, err.Error())
		return
	}
	diff := body.Diff
	if diff == nil && body.PRNum != 0 {
		prs, _ := commonsdiff.LoadFixturePRs()
		for i := range prs {
			if prs[i].Number == body.PRNum {
				diff = prs[i].ToDiff()
				break
			}
		}
	}
	if diff == nil {
		writeError(w, 400, "need {diff} or {pr_num}")
		return
	}
	corpus, err := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	bundles, _ := readBundles(s.CorpusRoot)
	settings := commonsdiff.DefaultSettings()
	if s.State != nil {
		var stored commonsdiff.RecommendSettings
		if ok, _ := s.State.GetSetting("recommend_settings", &stored); ok && stored.PrimaryCraft != "" {
			settings = stored
		}
	}
	recs := commonsdiff.Recommend(diff, corpus, bundles, settings)
	writeJSON(w, 200, recs)
}

// ─────────── PRs ───────────

func (s *Server) handlePRList(w http.ResponseWriter, r *http.Request) {
	prs, err := commonsdiff.LoadFixturePRs()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	// Project each fixture PR + run the recommender to bake recs[] into the
	// payload — keeps the frontend's Pull Request shape (files, semantic,
	// recs) intact while sourcing every field from real code.
	corpus, _ := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	bundles, _ := readBundles(s.CorpusRoot)
	settings := commonsdiff.DefaultSettings()

	out := make([]map[string]any, 0, len(prs))
	for i := range prs {
		pr := &prs[i]
		diff := pr.ToDiff()
		recs := commonsdiff.Recommend(diff, corpus, bundles, settings)
		out = append(out, map[string]any{
			"id":         pr.Number,
			"title":      pr.Title,
			"author":     pr.Author,
			"authorMeta": pr.AuthorMeta,
			"branch":     pr.Branch,
			"age":        pr.Age,
			"files":      pr.Files,
			"semantic":   pr.Semantic,
			"recs":       recs,
		})
	}
	// Merge in live gh PRs when configured. Each live PR gets the same
	// files+semantic+recs enrichment as fixtures, computed by fetching the
	// PR head locally and running the recommender against the resulting
	// SemanticDiff. enrichLivePR is cached (60s TTL) so repeated /api/prs
	// calls don't refetch.
	if s.GitHub != nil {
		if live, err := s.GitHub.ListPRs(r.Context()); err == nil {
			for _, lp := range live {
				b := s.enrichLivePR(r.Context(), lp.Number, corpus, bundles, settings)
				out = append(out, map[string]any{
					"id":         lp.Number,
					"title":      lp.Title,
					"author":     lp.Author,
					"authorMeta": lp.AuthorMeta,
					"branch":     lp.Branch,
					"age":        lp.Age,
					"files":      b.Files,
					"semantic":   b.Semantic,
					"recs":       b.Recs,
				})
			}
		}
	}
	writeJSON(w, 200, out)
}

func (s *Server) handlePRDetail(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.Atoi(r.PathValue("num"))
	if err != nil {
		writeError(w, 400, "num must be integer")
		return
	}
	prs, err := commonsdiff.LoadFixturePRs()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	for i := range prs {
		if prs[i].Number == num {
			pr := &prs[i]
			diff := pr.ToDiff()
			corpus, _ := indexer.LoadCorpus(s.CorpusRoot, "primitives")
			bundles, _ := readBundles(s.CorpusRoot)
			recs := commonsdiff.Recommend(diff, corpus, bundles, commonsdiff.DefaultSettings())
			writeJSON(w, 200, map[string]any{
				"id":         pr.Number,
				"title":      pr.Title,
				"author":     pr.Author,
				"authorMeta": pr.AuthorMeta,
				"branch":     pr.Branch,
				"age":        pr.Age,
				"files":      pr.Files,
				"semantic":   pr.Semantic,
				"recs":       recs,
			})
			return
		}
	}
	// Not a fixture — try live gh.
	if s.GitHub != nil {
		pr, gerr := s.GitHub.GetPR(r.Context(), num)
		if gerr == nil {
			corpus, _ := indexer.LoadCorpus(s.CorpusRoot, "primitives")
			bundles, _ := readBundles(s.CorpusRoot)
			b := s.enrichLivePR(r.Context(), num, corpus, bundles, commonsdiff.DefaultSettings())
			writeJSON(w, 200, map[string]any{
				"id":         pr.Number,
				"title":      pr.Title,
				"author":     pr.Author,
				"authorMeta": pr.AuthorMeta,
				"branch":     pr.Branch,
				"age":        pr.Age,
				"files":      b.Files,
				"semantic":   b.Semantic,
				"recs":       b.Recs,
			})
			return
		}
	}
	writeError(w, 404, "PR not found")
}

func (s *Server) handlePRMerge(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.Atoi(r.PathValue("num"))
	if err != nil {
		writeError(w, 400, "num must be integer")
		return
	}
	var body struct {
		Method string `json:"method"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Method == "" {
		body.Method = "squash"
	}
	if s.GitHub == nil {
		s.GitHub = newDryRunGH()
	}
	if err := s.GitHub.MergePR(r.Context(), num, body.Method); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	// Drop the cached diff/recs so the next list reflects merged state.
	invalidateLivePRCache(num)
	writeJSON(w, 200, map[string]any{
		"ok":      true,
		"pr":      num,
		"dry_run": s.GitHub.DryRun,
		"method":  body.Method,
	})
}

func (s *Server) handlePRComment(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.Atoi(r.PathValue("num"))
	if err != nil {
		writeError(w, 400, "num must be integer")
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if s.GitHub == nil {
		s.GitHub = newDryRunGH()
	}
	if err := s.GitHub.CommentPR(r.Context(), num, body.Body); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "pr": num, "dry_run": s.GitHub.DryRun})
}

func (s *Server) handlePRReview(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.Atoi(r.PathValue("num"))
	if err != nil {
		writeError(w, 400, "num must be integer")
		return
	}
	var body struct {
		Verdict string `json:"verdict"` // approve | request | comment
		Body    string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if s.GitHub == nil {
		s.GitHub = newDryRunGH()
	}
	if err := s.GitHub.Review(r.Context(), num, body.Verdict, body.Body); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "pr": num, "dry_run": s.GitHub.DryRun, "verdict": body.Verdict})
}

// ─────────── suggestions ───────────

func (s *Server) handleSuggestions(w http.ResponseWriter, r *http.Request) {
	if s.SuggestionsDir == "" {
		writeJSON(w, 200, []any{})
		return
	}
	entries, err := os.ReadDir(s.SuggestionsDir)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSON(w, 200, []any{})
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	type sugg struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Source   string `json:"source"`
		Captured string `json:"captured"`
		Status   string `json:"status"`
		Lang     string `json:"lang"`
		Body     string `json:"body"`
	}
	out := []sugg{}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".md" {
			continue
		}
		path := filepath.Join(s.SuggestionsDir, e.Name())
		info, _ := e.Info()
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		text := string(raw)
		title, body := splitFrontTitle(text)
		if title == "" {
			title = strings.TrimSuffix(e.Name(), ".md")
		}
		out = append(out, sugg{
			ID:       strings.TrimSuffix(e.Name(), ".md"),
			Title:    title,
			Source:   "vault",
			Captured: humanAge(time.Since(info.ModTime())),
			Status:   "open",
			Lang:     "en",
			Body:     body,
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	writeJSON(w, 200, out)
}

func splitFrontTitle(s string) (title, body string) {
	lines := strings.SplitN(s, "\n", 2)
	if len(lines) == 0 {
		return "", s
	}
	first := strings.TrimSpace(lines[0])
	if strings.HasPrefix(first, "# ") {
		title = strings.TrimSpace(strings.TrimPrefix(first, "# "))
		if len(lines) == 2 {
			body = strings.TrimSpace(lines[1])
		}
		return
	}
	return "", strings.TrimSpace(s)
}

func humanAge(d time.Duration) string {
	switch {
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}

// ─────────── settings ───────────

func (s *Server) handleSettingsGet(w http.ResponseWriter, r *http.Request) {
	if s.State == nil {
		writeJSON(w, 200, map[string]any{})
		return
	}
	all, err := s.State.AllSettings()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, all)
}

func (s *Server) handleSettingsPut(w http.ResponseWriter, r *http.Request) {
	if s.State == nil {
		writeError(w, 400, "state store not configured")
		return
	}
	var body map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	for k, v := range body {
		var decoded any
		_ = json.Unmarshal(v, &decoded)
		if err := s.State.SetSetting(k, decoded); err != nil {
			writeError(w, 500, err.Error())
			return
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ─────────── publish wizard ───────────

func (s *Server) handlePublishStage(w http.ResponseWriter, r *http.Request) {
	repo, err := commonsgit.Open(s.CorpusRoot)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	sd, err := repo.DiffWorkingTree()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	corpus, _ := indexer.LoadCorpus(s.CorpusRoot, "primitives")
	bundles, _ := readBundles(s.CorpusRoot)
	recs := commonsdiff.Recommend(sd, corpus, bundles, commonsdiff.DefaultSettings())
	writeJSON(w, 200, map[string]any{
		"diff": sd,
		"recs": recs,
	})
}

func (s *Server) handlePublishCommit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Message string   `json:"message"`
		Paths   []string `json:"paths,omitempty"`
		Author  string   `json:"author"`
		Email   string   `json:"email"`
		Push    bool     `json:"push,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	repo, err := commonsgit.Open(s.CorpusRoot)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	sha, err := repo.AddAndCommit(body.Paths, commonsgit.CommitOptions{
		Message: body.Message,
		Author:  body.Author,
		Email:   body.Email,
	})
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	out := map[string]any{"sha": sha}
	if body.Push {
		branch, _ := repo.CurrentBranch()
		if branch == "" {
			branch = "main"
		}
		if err := repo.Push("origin", branch, nil); err != nil {
			out["push_error"] = err.Error()
		} else {
			out["pushed"] = true
		}
	}
	writeJSON(w, 200, out)
}

// ─────────── federation ───────────

func (s *Server) handleFedList(w http.ResponseWriter, r *http.Request) {
	if s.Federation == nil {
		writeJSON(w, 200, []any{})
		return
	}
	writeJSON(w, 200, s.Federation.List())
}

func (s *Server) handleFedAdd(w http.ResponseWriter, r *http.Request) {
	if s.Federation == nil {
		writeError(w, 400, "federation manager not configured")
		return
	}
	var root federation.Root
	if err := json.NewDecoder(r.Body).Decode(&root); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	doClone := r.URL.Query().Get("clone") != "0"
	if err := s.Federation.Add(r.Context(), root, doClone, nil); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, s.Federation.Get(root.ID))
}

func (s *Server) handleFedRemove(w http.ResponseWriter, r *http.Request) {
	if s.Federation == nil {
		writeError(w, 400, "federation manager not configured")
		return
	}
	id := r.PathValue("id")
	purge := r.URL.Query().Get("purge") == "1"
	if err := s.Federation.Remove(id, purge); err != nil {
		writeError(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleFedSync(w http.ResponseWriter, r *http.Request) {
	if s.Federation == nil {
		writeError(w, 400, "federation manager not configured")
		return
	}
	id := r.PathValue("id")
	root, err := s.Federation.Sync(r.Context(), id, nil)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, root)
}

// ─────────── commits ───────────

func (s *Server) handleCommits(w http.ResponseWriter, r *http.Request) {
	repo, err := commonsgit.Open(s.CorpusRoot)
	if err != nil {
		writeJSON(w, 200, []any{})
		return
	}
	// go-git's Log requires non-nil LogOptions; passing nil panics inside
	// repository.go:1249. Empty struct == default (walk from HEAD).
	iter, err := repo.Underlying().Log(&gogit.LogOptions{})
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	type commit struct {
		SHA    string `json:"sha"`
		Author string `json:"author"`
		Time   string `json:"time"`
		Msg    string `json:"msg"`
	}
	out := []commit{}
	count := 0
	max := 20
	for {
		if count >= max {
			break
		}
		c, err := iter.Next()
		if err != nil {
			break
		}
		out = append(out, commit{
			SHA:    c.Hash.String()[:7],
			Author: c.Author.Name,
			Time:   humanAge(time.Since(c.Author.When)),
			Msg:    strings.TrimSpace(strings.SplitN(c.Message, "\n", 2)[0]),
		})
		count++
	}
	writeJSON(w, 200, out)
}

// ─────────── local changes ───────────

func (s *Server) handleLocalChanges(w http.ResponseWriter, r *http.Request) {
	repo, err := commonsgit.Open(s.CorpusRoot)
	if err != nil {
		writeJSON(w, 200, []any{})
		return
	}
	st, err := repo.Status()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	type change struct {
		Op    string `json:"op"`
		Path  string `json:"path"`
		State string `json:"state"`
		Slug  string `json:"slug"`
		Kind  string `json:"kind"`
	}
	out := []change{}
	for _, e := range st {
		kind := kindFromPath(e.Path)
		slug := slugFromPath(e.Path)
		state := "draft"
		if validatePathQuick(s.CorpusRoot, e.Path) {
			state = "validated"
		}
		if strings.HasPrefix(e.Path, "indexes/") {
			state = "regen"
		}
		out = append(out, change{
			Op:    e.Op,
			Path:  e.Path,
			State: state,
			Slug:  slug,
			Kind:  kind,
		})
	}
	writeJSON(w, 200, out)
}

func kindFromPath(p string) string {
	p = filepath.ToSlash(p)
	switch {
	case strings.HasPrefix(p, "primitives/tools/"):
		return "tool"
	case strings.HasPrefix(p, "primitives/materials/"):
		return "material"
	case strings.HasPrefix(p, "primitives/techniques/"):
		return "technique"
	case strings.HasPrefix(p, "primitives/workflows/"):
		return "workflow"
	case strings.HasPrefix(p, "bundles/"):
		return "bundle"
	case strings.HasPrefix(p, "indexes/"):
		return "index"
	default:
		return "other"
	}
}

func validatePathQuick(root, posix string) bool {
	if !strings.HasPrefix(posix, "primitives/") || !strings.HasSuffix(posix, ".json") {
		return false
	}
	abs := filepath.Join(root, filepath.FromSlash(posix))
	b, err := os.ReadFile(abs)
	if err != nil {
		return false
	}
	var doc map[string]any
	if err := json.Unmarshal(b, &doc); err != nil {
		return false
	}
	var p schema.Primitive
	raw, _ := json.Marshal(doc)
	if err := json.Unmarshal(raw, &p); err != nil {
		return false
	}
	return len(schema.ValidatePrimitive(&p)) == 0
}

// ─────────── helpers shared across handlers ───────────

func readBundles(corpusRoot string) ([]map[string]any, error) {
	dir := filepath.Join(corpusRoot, "indexes", "bundles")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []map[string]any
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		var doc map[string]any
		if err := json.Unmarshal(b, &doc); err != nil {
			return nil, err
		}
		out = append(out, doc)
	}
	return out, nil
}

func readBundle(corpusRoot, slug string) (map[string]any, error) {
	path := filepath.Join(corpusRoot, "indexes", "bundles", slug+".json")
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc map[string]any
	if err := json.Unmarshal(b, &doc); err != nil {
		return nil, err
	}
	return doc, nil
}

func writeBundle(corpusRoot string, doc map[string]any) error {
	slug, _ := doc["slug"].(string)
	if slug == "" {
		return errors.New("bundle slug required")
	}
	dir := filepath.Join(corpusRoot, "indexes", "bundles")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	return os.WriteFile(filepath.Join(dir, slug+".json"), b, 0o644)
}

// newDryRunGH returns a github.Client in dry-run mode, suitable when the
// caller has not wired up a live gh shell-out.
func newDryRunGH() *gh.Client {
	c := gh.New("", true, nil)
	c.Log = os.Stderr
	return c
}
