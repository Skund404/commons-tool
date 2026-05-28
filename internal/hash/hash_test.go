package hash

import (
	"strings"
	"testing"
)

func TestSumDeterministic(t *testing.T) {
	a := map[string]any{
		"b": 2,
		"a": 1,
		"nested": map[string]any{
			"y": "two",
			"x": "one",
		},
	}
	preA, hA, err := Sum(a)
	if err != nil {
		t.Fatalf("Sum a: %v", err)
	}

	// Different insertion order; same content => same canonical preimage.
	b := map[string]any{
		"a":      1,
		"b":      2,
		"nested": map[string]any{"x": "one", "y": "two"},
	}
	preB, hB, err := Sum(b)
	if err != nil {
		t.Fatalf("Sum b: %v", err)
	}

	if string(preA) != string(preB) {
		t.Errorf("preimage mismatch:\n  a = %s\n  b = %s", preA, preB)
	}
	if hA != hB {
		t.Errorf("hash mismatch: %s vs %s", hA, hB)
	}
	if !strings.HasPrefix(hA, "sha256:") {
		t.Errorf("hash prefix wrong: %s", hA)
	}
}

func TestSumStripsTransient(t *testing.T) {
	r := map[string]any{
		"slug":         "x",
		"modified":     "2026-05-28",
		"content_hash": "sha256:deadbeef",
		"nested": map[string]any{
			"current_git_ref": "abc",
			"k":               "v",
		},
	}
	pre, _, err := Sum(r)
	if err != nil {
		t.Fatal(err)
	}
	s := string(pre)
	for _, banned := range []string{"modified", "content_hash", "current_git_ref"} {
		if strings.Contains(s, banned) {
			t.Errorf("preimage contains transient field %q: %s", banned, s)
		}
	}
	if !strings.Contains(s, `"slug":"x"`) {
		t.Errorf("preimage missing slug: %s", s)
	}
}

func TestSumStringEscape(t *testing.T) {
	r := map[string]any{"s": "tab\there\nand\"quote"}
	pre, _, err := Sum(r)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"s":"tab\there\nand\"quote"}`
	if string(pre) != want {
		t.Errorf("got %s\nwant %s", string(pre), want)
	}
}

func TestSumNumberShapes(t *testing.T) {
	r := map[string]any{"int": 42, "f": 3.14}
	pre, _, err := Sum(r)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(pre), `"int":42`) {
		t.Errorf("int got %s", string(pre))
	}
	if !strings.Contains(string(pre), `"f":3.14`) {
		t.Errorf("float got %s", string(pre))
	}
}

func TestSumArrayPreservesOrder(t *testing.T) {
	r := map[string]any{"arr": []any{"c", "a", "b"}}
	pre, _, err := Sum(r)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"arr":["c","a","b"]}`
	if string(pre) != want {
		t.Errorf("got %s\nwant %s", string(pre), want)
	}
}

func TestSumNilEmpty(t *testing.T) {
	r := map[string]any{"a": nil, "b": []any{}, "c": map[string]any{}}
	pre, _, err := Sum(r)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"a":null,"b":[],"c":{}}`
	if string(pre) != want {
		t.Errorf("got %s\nwant %s", string(pre), want)
	}
}
