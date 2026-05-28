package keychain

import (
	"bytes"
	"errors"
	"testing"
)

func TestFileBackendRoundtrip(t *testing.T) {
	dir := t.TempDir()
	fb := NewFileBackend(dir)

	if err := fb.Save("token", []byte("hunter2")); err != nil {
		t.Fatal(err)
	}
	got, err := fb.Load("token")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, []byte("hunter2")) {
		t.Fatalf("roundtrip mismatch: %q", got)
	}
	if err := fb.Delete("token"); err != nil {
		t.Fatal(err)
	}
	if _, err := fb.Load("token"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound after delete, got %v", err)
	}
}

func TestFileBackendNotFound(t *testing.T) {
	dir := t.TempDir()
	fb := NewFileBackend(dir)
	if _, err := fb.Load("nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestFileBackendNameSanitization(t *testing.T) {
	// path-traversal attempt must be reduced to a single basename.
	dir := t.TempDir()
	fb := NewFileBackend(dir)
	if err := fb.Save("../../etc/secret", []byte("x")); err != nil {
		t.Fatal(err)
	}
	got, err := fb.Load("secret")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, []byte("x")) {
		t.Fatalf("want sanitized lookup to find secret, got %q", got)
	}
}
