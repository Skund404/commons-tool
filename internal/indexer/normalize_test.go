package indexer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// normVector mirrors one entry of testdata/normalization-vectors.json.
type normVector struct {
	Name     string   `json:"name"`
	Input    string   `json:"input"`
	Expected []string `json:"expected"`
	Note     string   `json:"note"`
}

type normFixture struct {
	Vectors []normVector `json:"vectors"`
}

// TestNormalizeKeyVectors is the Go side of the spec §9.9 cross-implementation
// determinism gate. The same fixture is reproduced by the Python reference impl
// (proto-commons mock: scripts/test_normalize.py). The two fixture files are
// kept byte-identical; if you edit one, mirror the other.
func TestNormalizeKeyVectors(t *testing.T) {
	path := filepath.Join("testdata", "normalization-vectors.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %s: %v", path, err)
	}
	var fx normFixture
	if err := json.Unmarshal(data, &fx); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if len(fx.Vectors) == 0 {
		t.Fatal("fixture has no vectors")
	}

	for _, v := range fx.Vectors {
		t.Run(v.Name, func(t *testing.T) {
			got := hexCodepoints(NormalizeKey(v.Input))
			if !equalStrings(got, v.Expected) {
				t.Errorf("NormalizeKey(%q):\n  got  %v\n  want %v\n  (%s)",
					v.Input, got, v.Expected, v.Note)
			}
		})
	}
}

func hexCodepoints(s string) []string {
	out := make([]string, 0, len(s))
	for _, r := range s {
		out = append(out, fmt.Sprintf("%04x", r))
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
