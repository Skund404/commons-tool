package state

import (
	"path/filepath"
	"testing"
)

func TestOpenAndMigrate(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(filepath.Join(dir, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	// Re-opening must be idempotent (migrations skip already-applied versions).
	s2, err := Open(filepath.Join(dir, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	s2.Close()
}

func TestRecentRoundtrip(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(filepath.Join(dir, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	if err := s.RecordRecent("sha256:aa", "awl", "tool", "primitives/tools/awl.json"); err != nil {
		t.Fatal(err)
	}
	if err := s.RecordRecent("sha256:bb", "round-knife", "tool", "primitives/tools/round-knife.json"); err != nil {
		t.Fatal(err)
	}
	// Update the first entry — should not duplicate.
	if err := s.RecordRecent("sha256:aa", "awl", "tool", "primitives/tools/awl.json"); err != nil {
		t.Fatal(err)
	}
	got, err := s.RecentList(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2, got %d", len(got))
	}
}

func TestSettings(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(filepath.Join(dir, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	type cfg struct {
		Accent string `json:"accent"`
		Wide   bool   `json:"wide"`
	}
	if err := s.SetSetting("tweaks", cfg{Accent: "burnt-sienna", Wide: true}); err != nil {
		t.Fatal(err)
	}
	var got cfg
	ok, err := s.GetSetting("tweaks", &got)
	if err != nil {
		t.Fatal(err)
	}
	if !ok || got.Accent != "burnt-sienna" || !got.Wide {
		t.Fatalf("setting roundtrip mismatch: ok=%v got=%+v", ok, got)
	}
}

func TestDrafts(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(filepath.Join(dir, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	body := map[string]any{"slug": "scratch-awl", "kind": "tool"}
	if err := s.SaveDraft("scratch-awl", "tool", body); err != nil {
		t.Fatal(err)
	}
	d, err := s.LoadDraft("scratch-awl")
	if err != nil {
		t.Fatal(err)
	}
	if d == nil || d.Kind != "tool" {
		t.Fatalf("draft load failed: %+v", d)
	}
	if err := s.DeleteDraft("scratch-awl"); err != nil {
		t.Fatal(err)
	}
	d2, _ := s.LoadDraft("scratch-awl")
	if d2 != nil {
		t.Fatalf("draft should be gone")
	}
}
