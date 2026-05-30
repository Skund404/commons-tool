package git

import "testing"

// A unified diff like `gh pr diff` emits: an added primitive (full content), a
// deleted primitive (full content), a modified primitive (hunk only), and a
// non-record file (ignored for semantic changes).
const samplePRDiff = `diff --git a/primitives/materials/egg.json b/primitives/materials/egg.json
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/primitives/materials/egg.json
@@ -0,0 +1,9 @@
+{
+  "opgl_version": "0.6",
+  "emitter": "opg://commons-seed",
+  "id": "egg-x",
+  "slug": "egg",
+  "kind": "material",
+  "name": "Egg",
+  "content_hash": "sha256:abc"
+}
diff --git a/primitives/tools/old-whisk.json b/primitives/tools/old-whisk.json
deleted file mode 100644
index 2222222..0000000
--- a/primitives/tools/old-whisk.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-  "slug": "old-whisk",
-  "kind": "tool",
-  "name": "Old Whisk",
-  "content_hash": "sha256:def"
-}
diff --git a/primitives/techniques/grate-pecorino.json b/primitives/techniques/grate-pecorino.json
index 3333333..4444444 100644
--- a/primitives/techniques/grate-pecorino.json
+++ b/primitives/techniques/grate-pecorino.json
@@ -5,7 +5,7 @@
   "name": "Grate Pecorino",
-  "content_hash": "sha256:old",
+  "content_hash": "sha256:new",
   "kind": "technique",
diff --git a/README.md b/README.md
index 5555555..6666666 100644
--- a/README.md
+++ b/README.md
@@ -1,1 +1,1 @@
-# old
+# new
`

func findChange(sd *SemanticDiff, slug string) *SemanticChange {
	for i := range sd.Changes {
		if sd.Changes[i].Slug == slug {
			return &sd.Changes[i]
		}
	}
	return nil
}

func TestParseUnifiedDiff(t *testing.T) {
	sd, err := ParseUnifiedDiff(samplePRDiff)
	if err != nil {
		t.Fatal(err)
	}

	// All four files appear in FileDiffs (incl. the non-record README).
	if len(sd.FileDiffs) != 4 {
		t.Fatalf("want 4 file diffs, got %d: %+v", len(sd.FileDiffs), sd.FileDiffs)
	}

	// Only the three record files become semantic changes (README excluded).
	if len(sd.Changes) != 3 {
		t.Fatalf("want 3 semantic changes, got %d: %+v", len(sd.Changes), sd.Changes)
	}

	egg := findChange(sd, "egg")
	if egg == nil || egg.Op != OpAdded || egg.Kind != "material" {
		t.Fatalf("added egg not parsed correctly: %+v", egg)
	}

	del := findChange(sd, "old-whisk")
	if del == nil || del.Op != OpDeleted || del.Kind != "tool" {
		t.Fatalf("deleted old-whisk not parsed correctly: %+v", del)
	}

	mod := findChange(sd, "grate-pecorino")
	if mod == nil || mod.Op != OpModified {
		t.Fatalf("modified grate-pecorino not parsed correctly: %+v", mod)
	}
	// Modified records are path-derived (kind/slug from the path, no full content).
	if mod.Kind != "technique" {
		t.Errorf("modified kind from path = %q, want technique", mod.Kind)
	}

	// Line counts on the modified file.
	for _, fc := range sd.FileDiffs {
		if fc.Path == "primitives/techniques/grate-pecorino.json" {
			if fc.Op != "M" || fc.Added != 1 || fc.Removed != 1 {
				t.Errorf("modified file diff = %+v, want M +1 -1", fc)
			}
		}
	}
}
