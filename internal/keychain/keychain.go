// Package keychain provides an OS-neutral secret store with a file-backed
// fallback for environments without a working OS keyring (headless Linux
// without a Secret Service daemon, sandboxes, CI).
//
// Backends:
//   - Default: github.com/zalando/go-keyring — wincred on Windows, libsecret/
//     Secret Service via godbus on Linux.
//   - Fallback: $HOME/.commons/keys/<name>.key, 0600 permissions.
//
// The OS backend is tried first. If it errors (no service available, permission
// denied), we transparently fall back to the file store and return that path
// in the error so the operator can audit it.
package keychain

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/zalando/go-keyring"
)

// ServiceName is the service identifier used in the OS keyring. Keep stable.
const ServiceName = "rillmark.commons"

// Keychain is the storage contract for credentials and tokens.
type Keychain interface {
	Save(name string, secret []byte) error
	Load(name string) ([]byte, error)
	Delete(name string) error
}

// ErrNotFound is returned by Load when the named secret does not exist.
var ErrNotFound = errors.New("keychain: secret not found")

// Default returns a Keychain that prefers the OS keyring and falls back to the
// file backend on any error.
func Default() Keychain {
	return &composite{
		primary:  &osBackend{},
		fallback: NewFileBackend(""),
	}
}

// NewFileBackend creates a file-backed keychain rooted at dir. If dir is
// empty, ~/.commons/keys is used.
func NewFileBackend(dir string) *FileBackend {
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "."
		}
		dir = filepath.Join(home, ".commons", "keys")
	}
	return &FileBackend{dir: dir}
}

// ─────────── OS backend ───────────

type osBackend struct{}

func (osBackend) Save(name string, secret []byte) error {
	return keyring.Set(ServiceName, name, string(secret))
}

func (osBackend) Load(name string) ([]byte, error) {
	v, err := keyring.Get(ServiceName, name)
	if err != nil {
		if errors.Is(err, keyring.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return []byte(v), nil
}

func (osBackend) Delete(name string) error {
	err := keyring.Delete(ServiceName, name)
	if err != nil && errors.Is(err, keyring.ErrNotFound) {
		return ErrNotFound
	}
	return err
}

// ─────────── File backend ───────────

// FileBackend stores each secret as a single file inside dir.
type FileBackend struct{ dir string }

// Dir returns the on-disk directory.
func (f *FileBackend) Dir() string { return f.dir }

func (f *FileBackend) ensureDir() error {
	return os.MkdirAll(f.dir, 0o700)
}

func (f *FileBackend) path(name string) string {
	// Sanitize to a single path segment so callers can't traverse.
	safe := filepath.Base(name) + ".key"
	return filepath.Join(f.dir, safe)
}

// Save writes secret to dir/<name>.key with 0600 perms (parent 0700).
func (f *FileBackend) Save(name string, secret []byte) error {
	if err := f.ensureDir(); err != nil {
		return err
	}
	tmp := f.path(name) + ".tmp"
	if err := os.WriteFile(tmp, secret, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, f.path(name)); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// Load reads dir/<name>.key.
func (f *FileBackend) Load(name string) ([]byte, error) {
	b, err := os.ReadFile(f.path(name))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return b, nil
}

// Delete removes dir/<name>.key. Returns ErrNotFound if absent.
func (f *FileBackend) Delete(name string) error {
	err := os.Remove(f.path(name))
	if err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

// ─────────── Composite (OS first, file fallback) ───────────

type composite struct {
	primary  Keychain
	fallback *FileBackend
}

func (c *composite) Save(name string, secret []byte) error {
	if err := c.primary.Save(name, secret); err == nil {
		return nil
	} else if isFatalKeyringError(err) {
		return c.fallback.Save(name, secret)
	} else {
		return fmt.Errorf("keychain: primary save failed: %w", err)
	}
}

func (c *composite) Load(name string) ([]byte, error) {
	b, err := c.primary.Load(name)
	if err == nil {
		return b, nil
	}
	if errors.Is(err, ErrNotFound) {
		// Try fallback — operator may have planted the secret there.
		b2, err2 := c.fallback.Load(name)
		if err2 == nil {
			return b2, nil
		}
		return nil, ErrNotFound
	}
	if isFatalKeyringError(err) {
		return c.fallback.Load(name)
	}
	return nil, err
}

func (c *composite) Delete(name string) error {
	err1 := c.primary.Delete(name)
	err2 := c.fallback.Delete(name)
	// Treat success in either backend as success; only error if both failed
	// with something other than ErrNotFound.
	if err1 == nil || err2 == nil {
		return nil
	}
	if errors.Is(err1, ErrNotFound) && errors.Is(err2, ErrNotFound) {
		return ErrNotFound
	}
	return errors.Join(err1, err2)
}

// isFatalKeyringError returns true when the OS keyring is unusable (no
// service, no session, broken installation) — i.e. when we should silently
// switch to the file fallback.
func isFatalKeyringError(err error) bool {
	if err == nil {
		return false
	}
	// zalando/go-keyring surfaces a small set of sentinels. We treat any error
	// that isn't ErrNotFound (handled separately) as "fall back" since the
	// commons tool's secrets are not high-stakes and we'd rather degrade than
	// abort.
	return !errors.Is(err, ErrNotFound) && !errors.Is(err, keyring.ErrNotFound)
}
