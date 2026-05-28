// Package github wraps PR operations. Simple ops shell out to the gh CLI
// (faster to ship and matches Pascal's existing auth state). Richer ops
// reserve a hook for google/go-github/v66, instantiated lazily when needed.
//
// Test mode: when DryRun is true, merge/comment/review calls only print the
// shell-equivalent command and return success without contacting GitHub.
package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	gh "github.com/google/go-github/v66/github"
)

// Client encapsulates the gh-CLI shell-out path plus optional go-github access.
type Client struct {
	DryRun bool   // when true, no real merge/comment/review happens
	Repo   string // "owner/repo"; empty means infer from gh in cwd
	Cwd    string // working directory for gh subprocesses; empty = current

	// Optional logger for shelled commands (nil → discard).
	Log io.Writer

	api    *gh.Client
	tokenF func() (string, error)
}

// New returns a Client. tokenFn is called lazily when a go-github operation
// is invoked; if nil, the gh CLI handles auth implicitly.
func New(repo string, dryRun bool, tokenFn func() (string, error)) *Client {
	return &Client{Repo: repo, DryRun: dryRun, tokenF: tokenFn}
}

// ─────────── gh CLI shell-out helpers ───────────

func (c *Client) ghArgs(extra ...string) []string {
	args := append([]string{}, extra...)
	if c.Repo != "" && !hasRepoFlag(extra) {
		args = append(args, "--repo", c.Repo)
	}
	return args
}

func hasRepoFlag(args []string) bool {
	for _, a := range args {
		if a == "--repo" || a == "-R" {
			return true
		}
	}
	return false
}

func (c *Client) runGh(ctx context.Context, args []string, stdin string) ([]byte, error) {
	if c.Log != nil {
		fmt.Fprintln(c.Log, "$ gh", strings.Join(args, " "))
	}
	cmd := exec.CommandContext(ctx, "gh", args...)
	if c.Cwd != "" {
		// Critical for the "tool pointed at a foreign repo" case: without
		// setting Dir, gh would auto-detect the repo from the launch CWD
		// (e.g., the commons-tool checkout) instead of the corpus we're
		// actually managing.
		cmd.Dir = c.Cwd
	}
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	cmd.Stderr = os.Stderr
	return cmd.Output()
}

func (c *Client) dryRun(verb string, args []string) {
	if c.Log != nil {
		fmt.Fprintf(c.Log, "[dry-run] %s\n$ gh %s\n", verb, strings.Join(args, " "))
	} else {
		fmt.Fprintf(os.Stderr, "[dry-run] %s\n$ gh %s\n", verb, strings.Join(args, " "))
	}
}

// ─────────── PR list / detail ───────────

// PullRequestSummary mirrors the frontend's PR card shape (minus recs/files;
// the recommender + diff parser fill those in).
type PullRequestSummary struct {
	Number     int       `json:"id"`
	Title      string    `json:"title"`
	Author     string    `json:"author"`
	AuthorMeta string    `json:"author_meta,omitempty"`
	Branch     string    `json:"branch"`
	Age        string    `json:"age"`
	CreatedAt  time.Time `json:"created_at"`
	BaseRef    string    `json:"base_ref"`
	HeadRef    string    `json:"head_ref"`
	State      string    `json:"state"`
	URL        string    `json:"url"`
}

// ListPRs returns open PRs via `gh pr list --json ...`.
func (c *Client) ListPRs(ctx context.Context) ([]PullRequestSummary, error) {
	out, err := c.runGh(ctx, c.ghArgs("pr", "list",
		"--state", "open",
		"--json", "number,title,author,headRefName,baseRefName,createdAt,state,url",
		"--limit", "200",
	), "")
	if err != nil {
		return nil, fmt.Errorf("gh pr list: %w", err)
	}
	var raw []struct {
		Number      int       `json:"number"`
		Title       string    `json:"title"`
		Author      struct{ Login string } `json:"author"`
		HeadRefName string    `json:"headRefName"`
		BaseRefName string    `json:"baseRefName"`
		CreatedAt   time.Time `json:"createdAt"`
		State       string    `json:"state"`
		URL         string    `json:"url"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("parse gh pr list: %w", err)
	}
	prs := make([]PullRequestSummary, 0, len(raw))
	for _, r := range raw {
		prs = append(prs, PullRequestSummary{
			Number:    r.Number,
			Title:     r.Title,
			Author:    r.Author.Login,
			Branch:    r.HeadRefName,
			Age:       humanizeAge(time.Since(r.CreatedAt)),
			CreatedAt: r.CreatedAt,
			BaseRef:   r.BaseRefName,
			HeadRef:   r.HeadRefName,
			State:     r.State,
			URL:       r.URL,
		})
	}
	return prs, nil
}

// GetPR fetches a single PR via `gh pr view --json ...`.
func (c *Client) GetPR(ctx context.Context, num int) (*PullRequestSummary, error) {
	out, err := c.runGh(ctx, c.ghArgs("pr", "view", fmt.Sprint(num),
		"--json", "number,title,author,headRefName,baseRefName,createdAt,state,url"), "")
	if err != nil {
		return nil, fmt.Errorf("gh pr view %d: %w", num, err)
	}
	var r struct {
		Number      int       `json:"number"`
		Title       string    `json:"title"`
		Author      struct{ Login string } `json:"author"`
		HeadRefName string    `json:"headRefName"`
		BaseRefName string    `json:"baseRefName"`
		CreatedAt   time.Time `json:"createdAt"`
		State       string    `json:"state"`
		URL         string    `json:"url"`
	}
	if err := json.Unmarshal(out, &r); err != nil {
		return nil, fmt.Errorf("parse gh pr view: %w", err)
	}
	return &PullRequestSummary{
		Number:    r.Number,
		Title:     r.Title,
		Author:    r.Author.Login,
		Branch:    r.HeadRefName,
		Age:       humanizeAge(time.Since(r.CreatedAt)),
		CreatedAt: r.CreatedAt,
		BaseRef:   r.BaseRefName,
		HeadRef:   r.HeadRefName,
		State:     r.State,
		URL:       r.URL,
	}, nil
}

// PRDiff returns the unified diff for a PR as a raw string.
func (c *Client) PRDiff(ctx context.Context, num int) (string, error) {
	out, err := c.runGh(ctx, c.ghArgs("pr", "diff", fmt.Sprint(num)), "")
	if err != nil {
		return "", fmt.Errorf("gh pr diff %d: %w", num, err)
	}
	return string(out), nil
}

// ─────────── merge / comment / review ───────────

// MergePR runs `gh pr merge --squash --delete-branch`. In DryRun mode the
// command is only echoed.
func (c *Client) MergePR(ctx context.Context, num int, method string) error {
	flag := "--squash"
	switch method {
	case "merge":
		flag = "--merge"
	case "rebase":
		flag = "--rebase"
	}
	args := c.ghArgs("pr", "merge", fmt.Sprint(num), flag, "--delete-branch")
	if c.DryRun {
		c.dryRun(fmt.Sprintf("MERGE PR #%d (%s)", num, method), args)
		return nil
	}
	_, err := c.runGh(ctx, args, "")
	return err
}

// CommentPR posts a comment via `gh pr comment <num> --body-file -`.
func (c *Client) CommentPR(ctx context.Context, num int, body string) error {
	args := c.ghArgs("pr", "comment", fmt.Sprint(num), "--body-file", "-")
	if c.DryRun {
		c.dryRun(fmt.Sprintf("COMMENT PR #%d: %s", num, oneLine(body)), args)
		return nil
	}
	_, err := c.runGh(ctx, args, body)
	return err
}

// Review posts a review with body+verdict.
//
// verdict:
//
//	"approve"  → --approve
//	"request"  → --request-changes
//	"comment"  → (no flag, just body)
func (c *Client) Review(ctx context.Context, num int, verdict, body string) error {
	args := []string{"pr", "review", fmt.Sprint(num), "--body-file", "-"}
	switch verdict {
	case "approve":
		args = append(args, "--approve")
	case "request":
		args = append(args, "--request-changes")
	case "comment":
		args = append(args, "--comment")
	default:
		return fmt.Errorf("github: unknown verdict %q", verdict)
	}
	args = c.ghArgs(args...)
	if c.DryRun {
		c.dryRun(fmt.Sprintf("REVIEW PR #%d (%s): %s", num, verdict, oneLine(body)), args)
		return nil
	}
	_, err := c.runGh(ctx, args, body)
	return err
}

// ClosePR closes a PR without merging.
func (c *Client) ClosePR(ctx context.Context, num int) error {
	args := c.ghArgs("pr", "close", fmt.Sprint(num), "--delete-branch")
	if c.DryRun {
		c.dryRun(fmt.Sprintf("CLOSE PR #%d", num), args)
		return nil
	}
	_, err := c.runGh(ctx, args, "")
	return err
}

// ─────────── go-github fallback (richer ops) ───────────

// API returns a go-github client, lazily initializing from the token function.
func (c *Client) API(ctx context.Context) (*gh.Client, error) {
	if c.api != nil {
		return c.api, nil
	}
	if c.tokenF == nil {
		return nil, errors.New("github: no token function configured")
	}
	tok, err := c.tokenF()
	if err != nil {
		return nil, err
	}
	c.api = gh.NewClient(nil).WithAuthToken(tok)
	return c.api, nil
}

// TokenFromGh reads `gh auth token` and returns the credential. Useful as a
// drop-in tokenFn.
func TokenFromGh() (string, error) {
	out, err := exec.Command("gh", "auth", "token").Output()
	if err != nil {
		return "", fmt.Errorf("gh auth token: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// ─────────── misc ───────────

func humanizeAge(d time.Duration) string {
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds ago", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	case d < 30*24*time.Hour:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	default:
		return fmt.Sprintf("%dmo ago", int(d.Hours()/(24*30)))
	}
}

func oneLine(s string) string {
	s = strings.ReplaceAll(s, "\n", " · ")
	if len(s) > 80 {
		return s[:77] + "..."
	}
	return s
}
