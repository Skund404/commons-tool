// Package federation manages multiple Proto-Commons roots side-by-side:
// the primary (`rillmark/proto-commons`) plus any number of read-only mirrors
// the maintainer wants to browse.
//
// Each root is cloned into ~/.commons/federation/<id>/ and read via
// internal/indexer. Pulls are explicit; we never auto-fetch.
package federation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	commonsgit "github.com/Skund404/commons-tool/internal/git"
	"github.com/Skund404/commons-tool/internal/indexer"
)

// Role indicates how the maintainer treats this root.
type Role string

const (
	RolePrimary Role = "primary" // writes go here
	RoleRead    Role = "read"    // browse-only
)

// Root is a configured federation entry.
type Root struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	Role      Role      `json:"role"`
	Craft     string    `json:"craft,omitempty"`
	LastSync  time.Time `json:"last_sync,omitempty"`
	PrimCount int       `json:"prim_count"`
	Languages []string  `json:"language"`
}

// Manager holds the federation registry and the on-disk clone root.
type Manager struct {
	registryPath string // <baseDir>/registry.json
	cloneDir     string // <baseDir>/<id>/
	roots        []Root
}

// New opens or creates a federation directory rooted at baseDir.
// If baseDir is empty, ~/.commons/federation is used.
func New(baseDir string) (*Manager, error) {
	if baseDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		baseDir = filepath.Join(home, ".commons", "federation")
	}
	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return nil, err
	}
	m := &Manager{
		registryPath: filepath.Join(baseDir, "registry.json"),
		cloneDir:     baseDir,
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *Manager) load() error {
	b, err := os.ReadFile(m.registryPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return json.Unmarshal(b, &m.roots)
}

func (m *Manager) save() error {
	b, err := json.MarshalIndent(m.roots, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.registryPath, b, 0o644)
}

// CloneDir returns the on-disk path where root <id> lives.
func (m *Manager) CloneDir(id string) string {
	return filepath.Join(m.cloneDir, id)
}

// List returns a defensive copy of the registry.
func (m *Manager) List() []Root {
	out := make([]Root, len(m.roots))
	copy(out, m.roots)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Role != out[j].Role {
			return out[i].Role == RolePrimary // primary first
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// Get returns the root with the given id, or nil.
func (m *Manager) Get(id string) *Root {
	for i := range m.roots {
		if m.roots[i].ID == id {
			return &m.roots[i]
		}
	}
	return nil
}

// Add registers a root and (optionally) clones it. If a root with the same id
// already exists, its url/role/name are updated in place.
func (m *Manager) Add(ctx context.Context, r Root, clone bool, auth commonsgit.AuthFunc) error {
	if r.ID == "" {
		return errors.New("federation: id required")
	}
	if r.URL == "" {
		return errors.New("federation: url required")
	}
	if r.Role == "" {
		r.Role = RoleRead
	}
	for i, existing := range m.roots {
		if existing.ID == r.ID {
			r.LastSync = existing.LastSync
			r.PrimCount = existing.PrimCount
			r.Languages = existing.Languages
			m.roots[i] = r
			if err := m.save(); err != nil {
				return err
			}
			if clone {
				_, err := commonsgit.Clone(r.URL, m.CloneDir(r.ID), 0, auth)
				return err
			}
			return nil
		}
	}
	m.roots = append(m.roots, r)
	if err := m.save(); err != nil {
		return err
	}
	if clone {
		if _, err := commonsgit.Clone(r.URL, m.CloneDir(r.ID), 0, auth); err != nil {
			return err
		}
	}
	return nil
}

// Remove unregisters a root and optionally deletes its working tree.
func (m *Manager) Remove(id string, purge bool) error {
	idx := -1
	for i := range m.roots {
		if m.roots[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return fmt.Errorf("federation: no root %q", id)
	}
	m.roots = append(m.roots[:idx], m.roots[idx+1:]...)
	if err := m.save(); err != nil {
		return err
	}
	if purge {
		_ = os.RemoveAll(m.CloneDir(id))
	}
	return nil
}

// Sync runs `git pull` against the named root and re-counts primitives.
func (m *Manager) Sync(ctx context.Context, id string, auth commonsgit.AuthFunc) (*Root, error) {
	r := m.Get(id)
	if r == nil {
		return nil, fmt.Errorf("federation: no root %q", id)
	}
	repo, err := commonsgit.Open(m.CloneDir(id))
	if err != nil {
		return nil, err
	}
	if err := repo.Pull("origin", "main", auth); err != nil {
		return nil, err
	}
	if err := m.refreshStats(r); err != nil {
		return nil, err
	}
	r.LastSync = time.Now().UTC()
	if err := m.save(); err != nil {
		return nil, err
	}
	return r, nil
}

// LoadCorpus returns the primitives currently checked out for the named root.
func (m *Manager) LoadCorpus(id string) ([]indexer.Item, error) {
	if m.Get(id) == nil {
		return nil, fmt.Errorf("federation: no root %q", id)
	}
	return indexer.LoadCorpus(m.CloneDir(id), "primitives")
}

// refreshStats updates PrimCount + Languages by walking the clone.
func (m *Manager) refreshStats(r *Root) error {
	corpus, err := indexer.LoadCorpus(m.CloneDir(r.ID), "primitives")
	if err != nil {
		return err
	}
	r.PrimCount = len(corpus)
	langSet := map[string]bool{}
	for _, it := range corpus {
		props, _ := it.Doc["properties"].(map[string]any)
		names, _ := props["names"].(map[string]any)
		for lang := range names {
			langSet[lang] = true
		}
	}
	r.Languages = r.Languages[:0]
	for l := range langSet {
		r.Languages = append(r.Languages, l)
	}
	sort.Strings(r.Languages)
	return nil
}
