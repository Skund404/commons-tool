package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	gogithttp "github.com/go-git/go-git/v5/plumbing/transport/http"

	commonsdiff "github.com/Skund404/commons-tool/internal/diff"
	commonsgit "github.com/Skund404/commons-tool/internal/git"
	gh "github.com/Skund404/commons-tool/internal/github"
	"github.com/Skund404/commons-tool/internal/indexer"
)

// LiveDiffCache holds recent SemanticDiff results keyed by "<num>" to spare
// the cost of refetching + recomputing on every /api/prs call. Entries live
// for 60s, which is plenty of TTL for the dashboard refresh cadence and
// short enough that a re-pushed PR head gets picked up on the next refresh.
type liveDiffEntry struct {
	sd        *commonsgit.SemanticDiff
	files     []commonsgit.FileChange
	semantic  []string
	recs      []commonsdiff.Recommendation
	expiresAt time.Time
}

var (
	liveDiffMu    sync.RWMutex
	liveDiffCache = map[int]liveDiffEntry{}
)

const liveDiffTTL = 60 * time.Second

// gitAuthFromGh returns a go-git AuthFunc that uses the gh CLI's token. For
// public repos a nil result also works (anonymous fetch), but using the token
// avoids rate limits and lets future private-repo work flow through.
func gitAuthFromGh() commonsgit.AuthFunc {
	return func(_ string) (*gogithttp.BasicAuth, error) {
		tok, err := gh.TokenFromGh()
		if err != nil || tok == "" {
			return nil, nil // anonymous
		}
		return &gogithttp.BasicAuth{Username: "x-access-token", Password: tok}, nil
	}
}

// liveDiffFromPR computes the SemanticDiff for a live GitHub PR by fetching
// the PR head ref into the local corpus clone, then running DiffRefs against
// the PR's base ref. Returns the existing helper output so callers can plug
// the result straight into the recommender.
func (s *Server) liveDiffFromPR(ctx context.Context, num int) (*commonsgit.SemanticDiff, *gh.PullRequestSummary, error) {
	if s.GitHub == nil {
		return nil, nil, errors.New("gh client not configured")
	}
	pr, err := s.GitHub.GetPR(ctx, num)
	if err != nil {
		return nil, nil, fmt.Errorf("gh pr view: %w", err)
	}
	repo, err := commonsgit.Open(s.CorpusRoot)
	if err != nil {
		return nil, nil, fmt.Errorf("open corpus as git repo: %w (pass --mock <git-checkout> for live PRs)", err)
	}
	auth := gitAuthFromGh()
	// Refresh base ref locally so the diff has a sensible starting point.
	// Failure here is non-fatal — the local main may already be current.
	_ = repo.FetchRef("origin", "refs/heads/"+pr.BaseRef, auth)
	if err := repo.FetchPR("origin", num, auth); err != nil {
		return nil, pr, fmt.Errorf("fetch PR head: %w", err)
	}
	sd, err := repo.DiffRefs(pr.BaseRef, fmt.Sprintf("refs/pull/%d", num))
	if err != nil {
		return nil, pr, fmt.Errorf("diff refs: %w", err)
	}
	sd.Source = fmt.Sprintf("pr#%d", num)
	return sd, pr, nil
}

// livePRBundle is the cached enrichment for a single live PR.
type livePRBundle struct {
	Files    []commonsgit.FileChange
	Semantic []string
	Recs     []commonsdiff.Recommendation
}

// enrichLivePR returns files+semantic+recs for a live PR, hitting the cache
// when fresh. Errors are surfaced as a single semantic bullet and empty recs,
// so the UI still renders the PR row.
func (s *Server) enrichLivePR(ctx context.Context, num int, corpus []indexer.Item, bundles []map[string]any, settings commonsdiff.RecommendSettings) livePRBundle {
	liveDiffMu.RLock()
	entry, ok := liveDiffCache[num]
	liveDiffMu.RUnlock()
	if ok && time.Now().Before(entry.expiresAt) {
		return livePRBundle{Files: entry.files, Semantic: entry.semantic, Recs: entry.recs}
	}

	sd, _, err := s.liveDiffFromPR(ctx, num)
	if err != nil {
		return livePRBundle{
			Semantic: []string{"Live PR diff unavailable: " + err.Error()},
		}
	}
	semantic := describeSemanticDiff(sd)
	recs := commonsdiff.Recommend(sd, corpus, bundles, settings)

	liveDiffMu.Lock()
	liveDiffCache[num] = liveDiffEntry{
		sd:        sd,
		files:     sd.FileDiffs,
		semantic:  semantic,
		recs:      recs,
		expiresAt: time.Now().Add(liveDiffTTL),
	}
	liveDiffMu.Unlock()

	return livePRBundle{Files: sd.FileDiffs, Semantic: semantic, Recs: recs}
}

// describeSemanticDiff turns the structured diff into human-readable bullets
// for the Review pane's "Semantic changes" card. Mirrors the hand-written
// strings the fixture PRs use.
func describeSemanticDiff(sd *commonsgit.SemanticDiff) []string {
	if sd == nil || len(sd.Changes) == 0 {
		return []string{"No record-level changes detected"}
	}
	var lines []string
	for _, c := range sd.Changes {
		switch c.Op {
		case commonsgit.OpAdded:
			kind := c.Kind
			if c.Class == commonsgit.ClassBundle {
				kind = "bundle"
			}
			lines = append(lines, fmt.Sprintf("New %s: %s", kind, c.Slug))
		case commonsgit.OpModified:
			parts := []string{fmt.Sprintf("Modified %s: %s", c.Kind, c.Slug)}
			var flags []string
			if c.HashChanged {
				flags = append(flags, "body")
			}
			if c.RelationshipsChanged {
				flags = append(flags, "relationships")
			}
			if c.NamesChanged {
				flags = append(flags, "names")
			}
			if c.LicenseChanged {
				flags = append(flags, "license")
			}
			if len(flags) > 0 {
				parts = append(parts, "("+strings.Join(flags, ", ")+" changed)")
			}
			lines = append(lines, strings.Join(parts, " "))
		case commonsgit.OpDeleted:
			lines = append(lines, fmt.Sprintf("Deleted %s: %s", c.Kind, c.Slug))
		}
	}
	return lines
}

// invalidateLivePRCache drops a single PR from the cache. Called by the merge
// handler so the UI reflects post-merge state on next list.
func invalidateLivePRCache(num int) {
	liveDiffMu.Lock()
	delete(liveDiffCache, num)
	liveDiffMu.Unlock()
}
