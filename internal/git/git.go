// Package git wraps go-git for the operations the commons tool needs:
// clone, fetch, status, working-tree-vs-HEAD diff, ref-vs-ref diff, commit,
// push. The semantic diff parser (Proto-Commons records → SemanticDiff) lives
// in diff.go.
package git

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
)

// AuthFunc resolves credentials for a remote URL. Return (nil, nil) for
// anonymous. Used by Push/Fetch/Clone.
type AuthFunc func(remoteURL string) (*http.BasicAuth, error)

// Repo is a thin handle around a go-git repository plus its filesystem root.
type Repo struct {
	root string
	repo *gogit.Repository
}

// Root returns the absolute working-tree path.
func (r *Repo) Root() string { return r.root }

// Underlying returns the go-git *Repository for callers needing escape hatches.
func (r *Repo) Underlying() *gogit.Repository { return r.repo }

// Open binds an existing git repository at root. Errors if root is not a repo.
func Open(root string) (*Repo, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	repo, err := gogit.PlainOpen(abs)
	if err != nil {
		return nil, fmt.Errorf("git: open %s: %w", abs, err)
	}
	return &Repo{root: abs, repo: repo}, nil
}

// Clone creates a fresh clone of url at dest. depth=0 means full history.
// If the destination already exists and is a valid repo, it is opened instead.
func Clone(url, dest string, depth int, auth AuthFunc) (*Repo, error) {
	abs, err := filepath.Abs(dest)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(abs, ".git")); err == nil {
		return Open(abs)
	}
	opts := &gogit.CloneOptions{
		URL:   url,
		Depth: depth,
	}
	if auth != nil {
		a, err := auth(url)
		if err != nil {
			return nil, err
		}
		if a != nil {
			opts.Auth = a
		}
	}
	repo, err := gogit.PlainClone(abs, false, opts)
	if err != nil {
		return nil, fmt.Errorf("git: clone %s: %w", url, err)
	}
	return &Repo{root: abs, repo: repo}, nil
}

// Fetch updates remote-tracking refs without touching the working tree.
func (r *Repo) Fetch(remote string, auth AuthFunc) error {
	opts := &gogit.FetchOptions{
		RemoteName: remote,
		Tags:       gogit.AllTags,
	}
	rem, err := r.repo.Remote(remote)
	if err == nil && auth != nil {
		if urls := rem.Config().URLs; len(urls) > 0 {
			a, aerr := auth(urls[0])
			if aerr != nil {
				return aerr
			}
			if a != nil {
				opts.Auth = a
			}
		}
	}
	if err := r.repo.Fetch(opts); err != nil && !errors.Is(err, gogit.NoErrAlreadyUpToDate) {
		return fmt.Errorf("git: fetch %s: %w", remote, err)
	}
	return nil
}

// Pull fast-forwards the named branch from the named remote.
func (r *Repo) Pull(remote, branch string, auth AuthFunc) error {
	wt, err := r.repo.Worktree()
	if err != nil {
		return err
	}
	opts := &gogit.PullOptions{
		RemoteName:    remote,
		ReferenceName: plumbing.NewBranchReferenceName(branch),
		SingleBranch:  true,
	}
	rem, err := r.repo.Remote(remote)
	if err == nil && auth != nil {
		if urls := rem.Config().URLs; len(urls) > 0 {
			a, aerr := auth(urls[0])
			if aerr != nil {
				return aerr
			}
			if a != nil {
				opts.Auth = a
			}
		}
	}
	if err := wt.Pull(opts); err != nil && !errors.Is(err, gogit.NoErrAlreadyUpToDate) {
		return fmt.Errorf("git: pull %s/%s: %w", remote, branch, err)
	}
	return nil
}

// Push sends the named branch to the named remote.
func (r *Repo) Push(remote, branch string, auth AuthFunc) error {
	opts := &gogit.PushOptions{
		RemoteName: remote,
		RefSpecs: []config.RefSpec{
			config.RefSpec(fmt.Sprintf("refs/heads/%s:refs/heads/%s", branch, branch)),
		},
	}
	rem, err := r.repo.Remote(remote)
	if err == nil && auth != nil {
		if urls := rem.Config().URLs; len(urls) > 0 {
			a, aerr := auth(urls[0])
			if aerr != nil {
				return aerr
			}
			if a != nil {
				opts.Auth = a
			}
		}
	}
	if err := r.repo.Push(opts); err != nil && !errors.Is(err, gogit.NoErrAlreadyUpToDate) {
		return fmt.Errorf("git: push %s/%s: %w", remote, branch, err)
	}
	return nil
}

// FetchPR shallow-fetches GitHub's refs/pull/<num>/head ref into a local
// refs/pull/<num> ref. Subsequent calls are cheap (go-git fetches
// incrementally). After this lands, the PR's commit graph is reachable
// from refs/pull/<num> for downstream DiffRefs.
func (r *Repo) FetchPR(remote string, num int, auth AuthFunc) error {
	refSpec := config.RefSpec(
		fmt.Sprintf("+refs/pull/%d/head:refs/pull/%d", num, num),
	)
	opts := &gogit.FetchOptions{
		RemoteName: remote,
		RefSpecs:   []config.RefSpec{refSpec},
	}
	rem, err := r.repo.Remote(remote)
	if err == nil && auth != nil {
		if urls := rem.Config().URLs; len(urls) > 0 {
			a, aerr := auth(urls[0])
			if aerr != nil {
				return aerr
			}
			if a != nil {
				opts.Auth = a
			}
		}
	}
	if err := r.repo.Fetch(opts); err != nil && !errors.Is(err, gogit.NoErrAlreadyUpToDate) {
		return fmt.Errorf("git: fetch PR #%d: %w", num, err)
	}
	return nil
}

// FetchRef fetches a single remote ref (e.g. "refs/heads/main") into its
// remote-tracking equivalent. Used to ensure base refs are up to date
// before computing a live PR diff.
func (r *Repo) FetchRef(remote, ref string, auth AuthFunc) error {
	opts := &gogit.FetchOptions{
		RemoteName: remote,
		RefSpecs:   []config.RefSpec{config.RefSpec("+" + ref + ":" + ref)},
	}
	rem, err := r.repo.Remote(remote)
	if err == nil && auth != nil {
		if urls := rem.Config().URLs; len(urls) > 0 {
			a, aerr := auth(urls[0])
			if aerr != nil {
				return aerr
			}
			if a != nil {
				opts.Auth = a
			}
		}
	}
	if err := r.repo.Fetch(opts); err != nil && !errors.Is(err, gogit.NoErrAlreadyUpToDate) {
		return fmt.Errorf("git: fetch %s: %w", ref, err)
	}
	return nil
}

// HeadRef returns the short SHA of HEAD.
func (r *Repo) HeadRef() (string, error) {
	ref, err := r.repo.Head()
	if err != nil {
		return "", err
	}
	return ref.Hash().String(), nil
}

// CurrentBranch returns the symbolic branch name pointed to by HEAD, or "" if
// HEAD is detached.
func (r *Repo) CurrentBranch() (string, error) {
	ref, err := r.repo.Head()
	if err != nil {
		return "", err
	}
	if ref.Name().IsBranch() {
		return ref.Name().Short(), nil
	}
	return "", nil
}

// ─────────── status ───────────

// StatusEntry is a single working-tree change.
type StatusEntry struct {
	Path    string `json:"path"`
	Op      string `json:"op"`     // "+" added, "M" modified, "-" deleted, "?" untracked
	Staged  bool   `json:"staged"` // present in the index?
}

// Status returns the working-tree status as a sorted list of entries.
func (r *Repo) Status() ([]StatusEntry, error) {
	wt, err := r.repo.Worktree()
	if err != nil {
		return nil, err
	}
	st, err := wt.Status()
	if err != nil {
		return nil, err
	}
	var out []StatusEntry
	for path, s := range st {
		op := mapStatusCode(s.Worktree, s.Staging)
		out = append(out, StatusEntry{
			Path:   filepath.ToSlash(path),
			Op:     op,
			Staged: s.Staging != gogit.Unmodified && s.Staging != gogit.Untracked,
		})
	}
	return out, nil
}

func mapStatusCode(worktree, staging gogit.StatusCode) string {
	switch {
	case staging == gogit.Added, worktree == gogit.Added:
		return "+"
	case staging == gogit.Deleted, worktree == gogit.Deleted:
		return "-"
	case staging == gogit.Modified, worktree == gogit.Modified:
		return "M"
	case staging == gogit.Untracked, worktree == gogit.Untracked:
		return "?"
	case staging == gogit.Renamed, worktree == gogit.Renamed:
		return "M"
	case staging == gogit.Copied, worktree == gogit.Copied:
		return "+"
	default:
		return "M"
	}
}

// ─────────── commit ───────────

// CommitOptions describes a single commit.
type CommitOptions struct {
	Message string
	Author  string
	Email   string
	Time    time.Time // zero → now
}

// AddAndCommit stages the given paths (or all changes when paths is empty) and
// records a commit with the supplied metadata.
func (r *Repo) AddAndCommit(paths []string, opts CommitOptions) (string, error) {
	wt, err := r.repo.Worktree()
	if err != nil {
		return "", err
	}
	if len(paths) == 0 {
		if err := wt.AddWithOptions(&gogit.AddOptions{All: true}); err != nil {
			return "", err
		}
	} else {
		for _, p := range paths {
			if _, err := wt.Add(p); err != nil {
				return "", fmt.Errorf("git: add %s: %w", p, err)
			}
		}
	}
	t := opts.Time
	if t.IsZero() {
		t = time.Now()
	}
	hash, err := wt.Commit(opts.Message, &gogit.CommitOptions{
		Author: &object.Signature{
			Name:  opts.Author,
			Email: opts.Email,
			When:  t,
		},
	})
	if err != nil {
		return "", err
	}
	return hash.String(), nil
}

// ─────────── ref resolution helpers ───────────

// ResolveRef accepts "main", "abc1234", "HEAD~1", refs/heads/foo, etc.
func (r *Repo) ResolveRef(name string) (plumbing.Hash, error) {
	h, err := r.repo.ResolveRevision(plumbing.Revision(name))
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("git: resolve %q: %w", name, err)
	}
	return *h, nil
}

// commitTree returns the tree for a given commit hash.
func (r *Repo) commitTree(h plumbing.Hash) (*object.Tree, error) {
	c, err := r.repo.CommitObject(h)
	if err != nil {
		return nil, err
	}
	return c.Tree()
}

// ReadBlobAtRef returns the file contents at path on the named ref. Returns
// (nil, nil) when the file does not exist at that ref.
func (r *Repo) ReadBlobAtRef(refName, posixPath string) ([]byte, error) {
	h, err := r.ResolveRef(refName)
	if err != nil {
		return nil, err
	}
	tree, err := r.commitTree(h)
	if err != nil {
		return nil, err
	}
	f, err := tree.File(strings.TrimPrefix(posixPath, "/"))
	if err != nil {
		if errors.Is(err, object.ErrFileNotFound) {
			return nil, nil
		}
		return nil, err
	}
	rd, err := f.Reader()
	if err != nil {
		return nil, err
	}
	defer rd.Close()
	buf := make([]byte, 0, f.Size)
	chunk := make([]byte, 4096)
	for {
		n, rerr := rd.Read(chunk)
		if n > 0 {
			buf = append(buf, chunk[:n]...)
		}
		if rerr != nil {
			break
		}
	}
	return buf, nil
}

// ReadBlobInWorktree reads path from the working tree.
func (r *Repo) ReadBlobInWorktree(posixPath string) ([]byte, error) {
	abs := filepath.Join(r.root, filepath.FromSlash(posixPath))
	b, err := os.ReadFile(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	return b, nil
}
