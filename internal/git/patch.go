package git

import (
	"path/filepath"
	"sort"
	"strings"
)

// patch.go parses the unified-diff text emitted by `gh pr diff <num>` into a
// SemanticDiff. It is the FALLBACK for live PR review when the corpus directory
// is not a local git checkout of the commons remote — in which case DiffRefs
// (the primary, git-object path in live_pr.go) can't fetch the PR head.
//
// A unified diff carries full content only for added files (all-`+` hunk) and
// deleted files (all-`-` hunk); for modified files it carries just the changed
// hunks, NOT the whole file. So added/deleted records are reconstructed and run
// through buildSemanticChange for full field-level analysis, while modified
// records get a file-level entry plus a path-derived SemanticChange (kind/slug
// from the path, no field flags). The git-object path remains strictly better
// when a checkout is available; this keeps live review working without one.

// ParseUnifiedDiff turns `gh pr diff` output into a SemanticDiff.
func ParseUnifiedDiff(diffText string) (*SemanticDiff, error) {
	out := &SemanticDiff{Source: "pr-text"}
	for _, sec := range splitDiffSections(diffText) {
		fc, before, after, op, path := parseFileSection(sec)
		if path == "" {
			continue
		}
		out.FileDiffs = append(out.FileDiffs, fc)
		if !isRecordPath(path) {
			continue
		}
		switch op {
		case "+":
			if sc, _ := buildSemanticChange(path, nil, after); sc != nil {
				out.Changes = append(out.Changes, *sc)
			}
		case "-":
			if sc, _ := buildSemanticChange(path, before, nil); sc != nil {
				out.Changes = append(out.Changes, *sc)
			}
		default: // "M" — full content unavailable from a unified diff.
			out.Changes = append(out.Changes, pathDerivedModified(path))
		}
	}
	sort.SliceStable(out.FileDiffs, func(i, j int) bool { return out.FileDiffs[i].Path < out.FileDiffs[j].Path })
	sort.SliceStable(out.Changes, func(i, j int) bool { return out.Changes[i].Path < out.Changes[j].Path })
	return out, nil
}

// splitDiffSections breaks the diff into one section per file, each beginning
// with its `diff --git ` line.
func splitDiffSections(text string) []string {
	var sections []string
	var cur []string
	flush := func() {
		if len(cur) > 0 {
			sections = append(sections, strings.Join(cur, "\n"))
			cur = nil
		}
	}
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "diff --git ") {
			flush()
		}
		if len(cur) > 0 || strings.HasPrefix(line, "diff --git ") {
			cur = append(cur, line)
		}
	}
	flush()
	return sections
}

// parseFileSection extracts the file's change op, path, line counts, and (for
// pure add/delete) the reconstructed content.
func parseFileSection(sec string) (fc FileChange, before, after []byte, op, path string) {
	lines := strings.Split(sec, "\n")
	var oldPath, newPath string
	isNew, isDel := false, false
	inHunk := false
	var addBody, delBody []string
	added, removed := 0, 0

	for _, ln := range lines {
		switch {
		case strings.HasPrefix(ln, "new file mode"):
			isNew = true
		case strings.HasPrefix(ln, "deleted file mode"):
			isDel = true
		case strings.HasPrefix(ln, "--- "):
			oldPath = stripDiffPathPrefix(strings.TrimPrefix(ln, "--- "))
		case strings.HasPrefix(ln, "+++ "):
			newPath = stripDiffPathPrefix(strings.TrimPrefix(ln, "+++ "))
		case strings.HasPrefix(ln, "rename from "):
			oldPath = stripDiffPathPrefix(strings.TrimPrefix(ln, "rename from "))
		case strings.HasPrefix(ln, "rename to "):
			newPath = stripDiffPathPrefix(strings.TrimPrefix(ln, "rename to "))
		case strings.HasPrefix(ln, "@@"):
			inHunk = true
		case inHunk && strings.HasPrefix(ln, "+"):
			added++
			addBody = append(addBody, ln[1:])
		case inHunk && strings.HasPrefix(ln, "-"):
			removed++
			delBody = append(delBody, ln[1:])
		}
	}

	switch {
	case isNew:
		op = "+"
		path = newPath
	case isDel:
		op = "-"
		path = oldPath
	default:
		op = "M"
		path = newPath
		if path == "" {
			path = oldPath
		}
	}
	if path == "" {
		return fc, nil, nil, "", ""
	}

	fc = FileChange{Op: op, Path: path, Added: added, Removed: removed}
	if op == "+" {
		after = []byte(strings.Join(addBody, "\n") + "\n")
	}
	if op == "-" {
		before = []byte(strings.Join(delBody, "\n") + "\n")
	}
	return fc, before, after, op, path
}

// stripDiffPathPrefix removes the leading "a/" / "b/" and a trailing tab+meta
// that git appends, and maps /dev/null to "".
func stripDiffPathPrefix(p string) string {
	p = strings.TrimSpace(p)
	if i := strings.IndexByte(p, '\t'); i >= 0 {
		p = p[:i]
	}
	if p == "/dev/null" {
		return ""
	}
	p = strings.TrimPrefix(p, "a/")
	p = strings.TrimPrefix(p, "b/")
	return p
}

// pathDerivedModified builds a coarse modified change for a record whose full
// content can't be reconstructed from a unified diff — kind/slug come from the
// path; field-level flags are left unset.
func pathDerivedModified(path string) SemanticChange {
	cls := classifyPath(path)
	sc := SemanticChange{Op: OpModified, Class: cls, Path: path, Slug: slugFromFilePath(path)}
	switch cls {
	case ClassPrimitive:
		sc.Kind = kindFromFilePath(path)
	case ClassBundle:
		sc.Kind = "bundle"
	}
	return sc
}

func slugFromFilePath(p string) string {
	return strings.TrimSuffix(filepath.Base(p), ".json")
}

// kindFromFilePath maps "primitives/<plural>/<slug>.json" to the singular kind.
func kindFromFilePath(p string) string {
	parts := strings.Split(filepath.ToSlash(p), "/")
	for i, seg := range parts {
		if seg == "primitives" && i+1 < len(parts) {
			return strings.TrimSuffix(parts[i+1], "s")
		}
	}
	return ""
}
