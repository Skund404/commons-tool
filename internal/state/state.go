// Package state owns the local SQLite store: recent records, search history,
// cached settings, last-validation results, and draft metadata.
//
// Default location:
//
//	Windows: %USERPROFILE%\.commons\state.sqlite
//	Linux:   $XDG_DATA_HOME/commons/state.sqlite (falls back to ~/.commons/state.sqlite)
//
// CGO-free via modernc.org/sqlite.
package state

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	_ "modernc.org/sqlite"
)

// Store wraps the open *sql.DB plus an absolute path for diagnostics.
type Store struct {
	db   *sql.DB
	Path string
}

// migrations are applied in order. Each migration is an idempotent block of SQL
// gated on the schema_version table. Append new migrations; never edit
// committed ones.
var migrations = []string{
	`CREATE TABLE IF NOT EXISTS schema_version (
		version INTEGER PRIMARY KEY,
		applied_at TEXT NOT NULL
	);`,
	`CREATE TABLE IF NOT EXISTS recent_primitives (
		hash TEXT NOT NULL PRIMARY KEY,
		slug TEXT NOT NULL,
		kind TEXT NOT NULL,
		path TEXT NOT NULL,
		opened_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_recent_opened ON recent_primitives(opened_at DESC);`,
	`CREATE TABLE IF NOT EXISTS search_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		query TEXT NOT NULL,
		ts TEXT NOT NULL,
		result_count INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_search_ts ON search_history(ts DESC);`,
	`CREATE TABLE IF NOT EXISTS settings_cache (
		key TEXT NOT NULL PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	`CREATE TABLE IF NOT EXISTS last_validation_results (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ran_at TEXT NOT NULL,
		ok INTEGER NOT NULL,
		errors_json TEXT NOT NULL,
		corpus_root TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_validation_ran ON last_validation_results(ran_at DESC);`,
	`CREATE TABLE IF NOT EXISTS drafts_metadata (
		slug TEXT NOT NULL PRIMARY KEY,
		kind TEXT NOT NULL,
		body_json TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_drafts_updated ON drafts_metadata(updated_at DESC);`,
}

// DefaultPath returns the per-OS default location for the state DB.
func DefaultPath() (string, error) {
	if runtime.GOOS == "linux" {
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			return filepath.Join(xdg, "commons", "state.sqlite"), nil
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".commons", "state.sqlite"), nil
}

// Open creates the parent directory if needed, opens the DB, and runs migrations.
func Open(path string) (*Store, error) {
	if path == "" {
		var err error
		path, err = DefaultPath()
		if err != nil {
			return nil, err
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("state: mkdir parent: %w", err)
	}
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(on)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("state: open: %w", err)
	}
	db.SetMaxOpenConns(1) // sqlite is single-writer; serialize.
	s := &Store{db: db, Path: path}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

// Close releases the underlying DB handle.
func (s *Store) Close() error { return s.db.Close() }

// migrate runs any pending migrations idempotently.
func (s *Store) migrate() error {
	if _, err := s.db.Exec(migrations[0]); err != nil {
		return fmt.Errorf("state: bootstrap schema_version: %w", err)
	}
	row := s.db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_version`)
	var current int
	if err := row.Scan(&current); err != nil {
		return fmt.Errorf("state: read schema_version: %w", err)
	}
	for i := current; i < len(migrations); i++ {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("state: migration %d: %w", i+1, err)
		}
		if _, err := tx.Exec(
			`INSERT INTO schema_version(version, applied_at) VALUES (?, ?)`,
			i+1, time.Now().UTC().Format(time.RFC3339),
		); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// ─────────── recent_primitives ───────────

// RecentEntry is a row in recent_primitives.
type RecentEntry struct {
	Hash     string    `json:"hash"`
	Slug     string    `json:"slug"`
	Kind     string    `json:"kind"`
	Path     string    `json:"path"`
	OpenedAt time.Time `json:"opened_at"`
}

// RecordRecent upserts a row into recent_primitives with current timestamp.
func (s *Store) RecordRecent(hash, slug, kind, path string) error {
	_, err := s.db.Exec(
		`INSERT INTO recent_primitives(hash, slug, kind, path, opened_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(hash) DO UPDATE SET
		   slug=excluded.slug, kind=excluded.kind, path=excluded.path, opened_at=excluded.opened_at`,
		hash, slug, kind, path, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

// RecentList returns the n most recently opened primitives, newest first.
func (s *Store) RecentList(n int) ([]RecentEntry, error) {
	if n <= 0 {
		n = 20
	}
	rows, err := s.db.Query(
		`SELECT hash, slug, kind, path, opened_at FROM recent_primitives ORDER BY opened_at DESC LIMIT ?`,
		n,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RecentEntry
	for rows.Next() {
		var e RecentEntry
		var ts string
		if err := rows.Scan(&e.Hash, &e.Slug, &e.Kind, &e.Path, &ts); err != nil {
			return nil, err
		}
		e.OpenedAt, _ = time.Parse(time.RFC3339, ts)
		out = append(out, e)
	}
	return out, rows.Err()
}

// ─────────── search_history ───────────

// RecordSearch appends a query to search_history.
func (s *Store) RecordSearch(query string, resultCount int) error {
	_, err := s.db.Exec(
		`INSERT INTO search_history(query, ts, result_count) VALUES (?, ?, ?)`,
		query, time.Now().UTC().Format(time.RFC3339), resultCount,
	)
	return err
}

// SearchHistory returns the last n search queries, newest first.
func (s *Store) SearchHistory(n int) ([]string, error) {
	if n <= 0 {
		n = 20
	}
	rows, err := s.db.Query(`SELECT query FROM search_history ORDER BY ts DESC LIMIT ?`, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var q string
		if err := rows.Scan(&q); err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// ─────────── settings_cache ───────────

// SetSetting stores a JSON-encodable value under key.
func (s *Store) SetSetting(key string, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO settings_cache(key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
		key, string(b), time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

// GetSetting decodes the JSON value for key into out.
func (s *Store) GetSetting(key string, out any) (bool, error) {
	row := s.db.QueryRow(`SELECT value FROM settings_cache WHERE key=?`, key)
	var raw string
	if err := row.Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if err := json.Unmarshal([]byte(raw), out); err != nil {
		return false, err
	}
	return true, nil
}

// AllSettings returns every key/raw-JSON pair currently cached.
func (s *Store) AllSettings() (map[string]json.RawMessage, error) {
	rows, err := s.db.Query(`SELECT key, value FROM settings_cache`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]json.RawMessage{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = json.RawMessage(v)
	}
	return out, rows.Err()
}

// ─────────── last_validation_results ───────────

// ValidationResult is a row in last_validation_results.
type ValidationResult struct {
	ID         int64     `json:"id"`
	RanAt      time.Time `json:"ran_at"`
	OK         bool      `json:"ok"`
	Errors     []string  `json:"errors"`
	CorpusRoot string    `json:"corpus_root"`
}

// RecordValidation persists a validator run.
func (s *Store) RecordValidation(ok bool, errs []string, corpusRoot string) error {
	b, err := json.Marshal(errs)
	if err != nil {
		return err
	}
	okInt := 0
	if ok {
		okInt = 1
	}
	_, err = s.db.Exec(
		`INSERT INTO last_validation_results(ran_at, ok, errors_json, corpus_root) VALUES (?, ?, ?, ?)`,
		time.Now().UTC().Format(time.RFC3339), okInt, string(b), corpusRoot,
	)
	return err
}

// LastValidation returns the most recent validator run, or (nil, nil) if none.
func (s *Store) LastValidation() (*ValidationResult, error) {
	row := s.db.QueryRow(
		`SELECT id, ran_at, ok, errors_json, corpus_root FROM last_validation_results ORDER BY id DESC LIMIT 1`,
	)
	var r ValidationResult
	var ts, errsJSON string
	var ok int
	if err := row.Scan(&r.ID, &ts, &ok, &errsJSON, &r.CorpusRoot); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	r.RanAt, _ = time.Parse(time.RFC3339, ts)
	r.OK = ok != 0
	_ = json.Unmarshal([]byte(errsJSON), &r.Errors)
	return &r, nil
}

// ─────────── drafts_metadata ───────────

// Draft is a row in drafts_metadata.
type Draft struct {
	Slug      string          `json:"slug"`
	Kind      string          `json:"kind"`
	Body      json.RawMessage `json:"body"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// SaveDraft upserts a draft body. Body must be a JSON-encodable structure.
func (s *Store) SaveDraft(slug, kind string, body any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO drafts_metadata(slug, kind, body_json, updated_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT(slug) DO UPDATE SET kind=excluded.kind, body_json=excluded.body_json, updated_at=excluded.updated_at`,
		slug, kind, string(b), time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

// LoadDraft fetches a draft by slug, or returns (nil, nil) if absent.
func (s *Store) LoadDraft(slug string) (*Draft, error) {
	row := s.db.QueryRow(`SELECT slug, kind, body_json, updated_at FROM drafts_metadata WHERE slug=?`, slug)
	var d Draft
	var body, ts string
	if err := row.Scan(&d.Slug, &d.Kind, &body, &ts); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	d.Body = json.RawMessage(body)
	d.UpdatedAt, _ = time.Parse(time.RFC3339, ts)
	return &d, nil
}

// ListDrafts returns drafts ordered by updated_at descending.
func (s *Store) ListDrafts() ([]Draft, error) {
	rows, err := s.db.Query(`SELECT slug, kind, body_json, updated_at FROM drafts_metadata ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Draft
	for rows.Next() {
		var d Draft
		var body, ts string
		if err := rows.Scan(&d.Slug, &d.Kind, &body, &ts); err != nil {
			return nil, err
		}
		d.Body = json.RawMessage(body)
		d.UpdatedAt, _ = time.Parse(time.RFC3339, ts)
		out = append(out, d)
	}
	return out, rows.Err()
}

// DeleteDraft removes a draft by slug.
func (s *Store) DeleteDraft(slug string) error {
	_, err := s.db.Exec(`DELETE FROM drafts_metadata WHERE slug=?`, slug)
	return err
}
