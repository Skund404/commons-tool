# Roadmap

Tracked engineering work after the v0.1.0 cut (2026-05-28). Items live here
until they ship; closed items move to the changelog (or get deleted, with the
shipping commit standing as the record).

Sequence is loose — pull whichever item is the biggest user-visible win
against effort at any given moment.

---

## Recently shipped

- **Intake pane** (paste-import): paste raw JSON shared on Discord/Reddit
  (single, array, NDJSON, or `---`-separated). Auto-detects spec vs UI
  shape per doc, projects spec → UI. Each accepted item lands in the
  draft queue with per-row Edit / Validate / Stage / Discard. Replaces
  the manual "edit a JSON file in the working tree" workflow for
  crowdsourced primitives.

- **Primitive CRUD + draft lifecycle** (PR feat/primitive-crud-drafts):
  POST/PUT/DELETE/fork on primitives plus full draft create→update→validate
  →stage→delete. Integration gates wrap every write (schema, hash auth,
  slug collision, cycle detection, dangling-ref check, auto-index regen,
  bundle-integrity warning, state log). Editor and Browser panes wired
  through TanStack Query mutations. Closes the "tool cannot persist anything"
  gap that blocked Step 3 seed-corpus authoring.

- **CI on every PR** (`.github/workflows/ci.yml`): go (verify-mock + test-go),
  frontend (lint + typecheck + build), cross-compile, and Playwright e2e on
  Linux + Windows. `commons-tool` `main` now *requires* these checks green to
  merge (branch-protection required status checks).

- **intake-incoming** (`commons intake-incoming`): explode
  `contributions/incoming/` ships (closures + bundles) into the canonical
  corpus and rebuild indexes; maps HideSync's authoring-shape bundle to the
  canonical `schema.Bundle` shape, preserving per-item notes (the `note` field
  added to `schema.BundleItem`).

- **Schema validator unit tests + tagged release binaries**: `internal/schema`
  now has table-driven coverage of `ValidatePrimitive` / `ValidateBundle`; a
  `v*.*.*` tag (`.github/workflows/release.yml`) builds and attaches
  `commons-{linux,windows}-amd64` archives + `SHA256SUMS.txt` to a GitHub
  Release, so contributors can grab a binary without a toolchain.

- **§9.9 cross-impl normalization gate** (active): commons-tool CI runs the
  Python reference (`proto-commons@test-corpus/scripts/test_normalize.py`)
  against a byte-identical vectors fixture, alongside the Go gate, so
  `str.casefold()`/`unicodedata` can't silently diverge from
  `x/text/cases.Fold`.

- **Live PR review** (`/api/diff?source=pr`, `/api/prs`, `/api/prs/{n}`): a
  non-fixture PR is reviewed live. Primary path fetches the PR head ref and
  diffs git objects (`liveDiffFromPR` → `DiffRefs`); when the corpus dir isn't
  a local git checkout, it falls back to parsing `gh pr diff` text
  (`internal/git/patch.go` → `ParseUnifiedDiff`: full analysis for added/deleted
  records, file-level for modified). The fixture PRs (`internal/diff/fixtures/`)
  remain for offline/demo. *(The original plan was the text parser alone; the
  git-object path was added as the better primary and is strictly more accurate
  on modified records — the text path is the no-checkout fallback.)*

---

## Mid term

### Suggestions → draft pipeline

Today `/api/suggestions` reads `_Proto-Commons/suggestions/*.md` from the
vault and surfaces them on the Dashboard + Suggestions list. The next
maintainer move is one click from there:

> "Promote this suggestion to a draft primitive."

Behavior:

- Open the Editor pane in `fresh` mode with the suggestion title pre-filled
- `internal/state.drafts_metadata` persists across launches
- "Decline" suggestion writes a reason into the same store

### Bundle item picker (autocomplete)

Bundle editor currently relies on the user to type slugs. Add a primitive
picker matching the Editor's relationship picker (it already has the search
+ keyboard navigation pattern; lift it into `components/`).

### Federation: live clone + sync

`internal/federation` has the manager + on-disk layout but the UI's
"Add root" / "Sync all" buttons are not yet wired. Two-step:

1. Wire `useAddFederationRoot` + `useSyncFederationRoot` mutations to the
   Federation pane buttons
2. Background sync schedule via the State store (last_sync + a polling
   interval setting)

---

## Long term

### Repo transfer to `rillmark/` org

At incorporation, transfer from `Skund404/commons-tool` to
`rillmark/commons-tool`. GitHub auto-redirects the old URL for git+web
traffic, so existing clones and links stay alive. CODEOWNERS gets updated;
nothing else moves.

Same migration applies to the OPG-L spec repo and the proto-commons content
repo. Coordinate the transfers so all three move within the same window.

### Profile system → operator-tier features

OPG-L 0.6 profiles are spec-level. As implementations land in commons-tool,
expose profile selection (strict-runtime / data-format / minimum-disclosure)
in Settings. Profile selection gates which validator rules fire and which
gates the recommender emits. Foreshadowed by `RecommendSettings` in
`internal/diff/recommendation.go` — that struct is the wedge.

### Plugin surface for new gate kinds

Recommender gates are currently hard-coded into `internal/diff/gates.go`,
`heuristics.go`, `info.go`. Once external contributors want to add gates
(e.g. domain-specific safety checks), expose a Go interface + a discovery
mechanism so a third party can ship a `commons-plugin-<thing>` repo without
forking core.

---

## Not on the roadmap

Calling these out so they don't bubble up as suggestions:

- **macOS** — intentionally deferred for v1. Linux + Windows are the
  committed target.
- **Remote collaboration / multi-user state** — `commons` is single-
  maintainer by design. The collaboration story lives in the broader
  Foundation infrastructure (SaaS layer, federation), not in this tool.
- **Web hosting** — `commons` is a desktop maintainer instrument, not a
  public commons browser. The public browsing surface is the proto-commons
  repo itself on GitHub.
- **Telemetry** — locked. Never.
