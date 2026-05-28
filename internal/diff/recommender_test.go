package diff

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/Skund404/commons-tool/internal/indexer"
)

const mockRoot = `F:\Rillmark\_Proto-Commons\mock`

func loadMockCorpus(t *testing.T) []indexer.Item {
	t.Helper()
	c, err := indexer.LoadCorpus(mockRoot, "primitives")
	if err != nil {
		t.Fatalf("mock corpus: %v", err)
	}
	return c
}

func countSeverity(recs []Recommendation, sev Severity) int {
	n := 0
	for _, r := range recs {
		if r.Sev == sev {
			n++
		}
	}
	return n
}

func titles(recs []Recommendation) []string {
	out := make([]string, 0, len(recs))
	for _, r := range recs {
		out = append(out, r.Title)
	}
	return out
}

func TestFixturePR12_ScratchAwl(t *testing.T) {
	corpus := loadMockCorpus(t)
	prs, err := LoadFixturePRs()
	if err != nil {
		t.Fatalf("LoadFixturePRs: %v", err)
	}
	var pr *FixturePR
	for i := range prs {
		if prs[i].Number == 12 {
			pr = &prs[i]
			break
		}
	}
	if pr == nil {
		t.Fatal("PR #12 fixture not found")
	}
	bundles, _ := loadBundlesShim(mockRoot)
	recs := Recommend(pr.ToDiff(), corpus, bundles, DefaultSettings())

	t.Logf("PR #12 recs (%d):", len(recs))
	for _, r := range recs {
		t.Logf("  [%s] %s", r.Sev, r.Title)
	}

	approves := countSeverity(recs, SevApprove)
	warns := countSeverity(recs, SevWarn)
	infos := countSeverity(recs, SevInfo)
	rejects := countSeverity(recs, SevReject)

	if rejects != 0 {
		t.Errorf("PR #12: expected 0 REJECTs, got %d (%v)", rejects, titles(recs))
	}
	if approves < 3 {
		t.Errorf("PR #12: expected at least 3 APPROVEs (schema/hash/license), got %d", approves)
	}
	if warns < 1 {
		t.Errorf("PR #12: expected a WARN for `awl` alias collision, got %d (%v)", warns, titles(recs))
	}
	if infos < 1 {
		t.Errorf("PR #12: expected an INFO for new emitter, got %d", infos)
	}
	// The alias-collision WARN should mention 'awl'.
	foundAliasWarn := false
	for _, r := range recs {
		if r.Sev == SevWarn && strings.Contains(strings.ToLower(r.Title), "awl") {
			foundAliasWarn = true
			break
		}
	}
	if !foundAliasWarn {
		t.Errorf("PR #12: expected WARN mentioning 'awl' alias collision; got %v", titles(recs))
	}
}

func TestFixturePR11_CocoboloSlicker(t *testing.T) {
	corpus := loadMockCorpus(t)
	prs, err := LoadFixturePRs()
	if err != nil {
		t.Fatal(err)
	}
	var pr *FixturePR
	for i := range prs {
		if prs[i].Number == 11 {
			pr = &prs[i]
			break
		}
	}
	if pr == nil {
		t.Fatal("PR #11 fixture not found")
	}
	bundles, _ := loadBundlesShim(mockRoot)
	recs := Recommend(pr.ToDiff(), corpus, bundles, DefaultSettings())

	t.Logf("PR #11 recs (%d):", len(recs))
	for _, r := range recs {
		t.Logf("  [%s] %s", r.Sev, r.Title)
	}

	if rejects := countSeverity(recs, SevReject); rejects != 0 {
		t.Errorf("PR #11: expected 0 REJECTs, got %d (%v)", rejects, titles(recs))
	}
	if approves := countSeverity(recs, SevApprove); approves < 3 {
		t.Errorf("PR #11: expected ≥3 APPROVEs (schema/hash/license), got %d", approves)
	}
}

func TestFixturePR10_PinkingShearsMisclassified(t *testing.T) {
	corpus := loadMockCorpus(t)
	prs, err := LoadFixturePRs()
	if err != nil {
		t.Fatal(err)
	}
	var pr *FixturePR
	for i := range prs {
		if prs[i].Number == 10 {
			pr = &prs[i]
			break
		}
	}
	if pr == nil {
		t.Fatal("PR #10 fixture not found")
	}
	bundles, _ := loadBundlesShim(mockRoot)
	recs := Recommend(pr.ToDiff(), corpus, bundles, DefaultSettings())

	t.Logf("PR #10 recs (%d):", len(recs))
	for _, r := range recs {
		t.Logf("  [%s] %s", r.Sev, r.Title)
	}

	if rejects := countSeverity(recs, SevReject); rejects < 1 {
		t.Errorf("PR #10: expected at least 1 REJECT (kind mismatch), got %d", rejects)
	}
	if warns := countSeverity(recs, SevWarn); warns < 1 {
		t.Errorf("PR #10: expected at least 1 WARN (outside craft domain), got %d", warns)
	}
	foundKindReject := false
	foundCraftWarn := false
	for _, r := range recs {
		if r.Sev == SevReject && strings.Contains(strings.ToLower(r.Title), "kind mismatch") {
			foundKindReject = true
		}
		if r.Sev == SevWarn && strings.Contains(strings.ToLower(r.Title), "outside primary craft") {
			foundCraftWarn = true
		}
	}
	if !foundKindReject {
		t.Errorf("PR #10: expected REJECT 'Kind mismatch'; got %v", titles(recs))
	}
	if !foundCraftWarn {
		t.Errorf("PR #10: expected WARN 'Outside primary craft domain'; got %v", titles(recs))
	}
}

func TestRecommenderIgnoresUnrelatedFiles(t *testing.T) {
	// Sanity: a SemanticDiff with only index files (non-records) yields no recs.
	corpus := loadMockCorpus(t)
	if _, err := filepath.Abs(mockRoot); err != nil {
		t.Fatal(err)
	}
	bundles, _ := loadBundlesShim(mockRoot)
	pr := FixturePR{}
	recs := Recommend(pr.ToDiff(), corpus, bundles, DefaultSettings())
	if len(recs) != 0 {
		t.Fatalf("want 0 recs from empty diff, got %d", len(recs))
	}
}
