package git

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// newTestRepo creates a fresh on-disk git repo with one initial commit and
// returns its absolute root.
func newTestRepo(t *testing.T) (string, *Repo) {
	t.Helper()
	dir := t.TempDir()
	r, err := gogit.PlainInit(dir, false)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("seed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	wt, _ := r.Worktree()
	_, _ = wt.Add("README.md")
	_, err = wt.Commit("init", &gogit.CommitOptions{
		Author: &object.Signature{Name: "t", Email: "t@x", When: time.Now()},
	})
	if err != nil {
		t.Fatal(err)
	}
	repo, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return dir, repo
}

func TestStatusAndDiffWorkingTree(t *testing.T) {
	dir, repo := newTestRepo(t)

	// Stage a new primitive.
	prim := `{
  "opgl_version": "0.6",
  "emitter": "opg://mock",
  "id": "scratch-awl-mock",
  "slug": "scratch-awl",
  "kind": "tool",
  "name": "Scratch Awl",
  "created": "2026-05-28",
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000999",
  "properties": {
    "license": "CC-BY-4.0",
    "names": { "en": ["scratch awl", "awl"] }
  }
}
`
	pdir := filepath.Join(dir, "primitives", "tools")
	if err := os.MkdirAll(pdir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pdir, "scratch-awl.json"), []byte(prim), 0o644); err != nil {
		t.Fatal(err)
	}

	st, err := repo.Status()
	if err != nil {
		t.Fatal(err)
	}
	if len(st) == 0 {
		t.Fatal("expected status entry")
	}

	sd, err := repo.DiffWorkingTree()
	if err != nil {
		t.Fatal(err)
	}
	if len(sd.Changes) != 1 {
		t.Fatalf("want 1 semantic change, got %d", len(sd.Changes))
	}
	sc := sd.Changes[0]
	if sc.Op != OpAdded || sc.Class != ClassPrimitive || sc.Slug != "scratch-awl" || sc.Kind != "tool" {
		t.Fatalf("unexpected change: %+v", sc)
	}
}

func TestDiffRefs(t *testing.T) {
	dir, repo := newTestRepo(t)

	// Commit a primitive at HEAD.
	pdir := filepath.Join(dir, "primitives", "tools")
	_ = os.MkdirAll(pdir, 0o755)
	original := `{"slug":"awl","kind":"tool","content_hash":"sha256:0a","properties":{"license":"CC-BY-4.0","names":{"en":["awl"]}}}`
	_ = os.WriteFile(filepath.Join(pdir, "awl.json"), []byte(original), 0o644)
	if _, err := repo.AddAndCommit(nil, CommitOptions{Message: "add awl", Author: "t", Email: "t@x"}); err != nil {
		t.Fatal(err)
	}

	// Modify and commit again.
	modified := `{"slug":"awl","kind":"tool","content_hash":"sha256:0b","properties":{"license":"CC-BY-4.0","names":{"en":["awl","pricker"]}}}`
	_ = os.WriteFile(filepath.Join(pdir, "awl.json"), []byte(modified), 0o644)
	if _, err := repo.AddAndCommit(nil, CommitOptions{Message: "alias pricker", Author: "t", Email: "t@x"}); err != nil {
		t.Fatal(err)
	}

	sd, err := repo.DiffRefs("HEAD~1", "HEAD")
	if err != nil {
		t.Fatal(err)
	}
	if len(sd.Changes) != 1 {
		t.Fatalf("want 1 change, got %d (file diffs=%d)", len(sd.Changes), len(sd.FileDiffs))
	}
	sc := sd.Changes[0]
	if sc.Op != OpModified {
		t.Fatalf("want modified, got %s", sc.Op)
	}
	if !sc.HashChanged {
		t.Fatal("HashChanged should be true")
	}
	if !sc.NamesChanged {
		t.Fatal("NamesChanged should be true")
	}
}
