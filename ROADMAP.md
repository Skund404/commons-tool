# Roadmap

Tracked engineering work after the v0.1.0 cut (2026-05-28). Items live here
until they ship; closed items move to the changelog (or get deleted, with the
shipping commit standing as the record).

Sequence is loose — pull whichever item is the biggest user-visible win
against effort at any given moment.

---

## Recently shipped

- **Primitive CRUD + draft lifecycle** (PR feat/primitive-crud-drafts):
  POST/PUT/DELETE/fork on primitives plus full draft create→update→validate
  →stage→delete. Integration gates wrap every write (schema, hash auth,
  slug collision, cycle detection, dangling-ref check, auto-index regen,
  bundle-integrity warning, state log). Editor and Browser panes wired
  through TanStack Query mutations. Closes the "tool cannot persist anything"
  gap that blocked Step 3 seed-corpus authoring.

---

## Short term

### CI: `make test-go` + `make e2e` on PRs

GitHub Actions workflow at `.github/workflows/ci.yml` that runs:

- `make verify-mock` against the in-repo mock corpus
- `make test-go` (4 packages with tests)
- `make build` (cross-check the embed pipeline)
- `make install-pw && make e2e` (13 Playwright tests)

Once the workflow is green on a PR, add the job name to the branch-protection
required status checks so merges block on red CI. The protection rule is
already in place — only the status check list needs updating.

### Release artifacts on tagged builds

A `release.yml` workflow triggered on `v*.*.*` tags. Builds both targets
and attaches them to the GitHub Release:

- `commons-linux-amd64.tar.gz`
- `commons-windows-amd64.zip`

So contributors can grab a binary without a toolchain. SHA-256 sums alongside.

### Live `gh pr diff` → SemanticDiff

`internal/diff/recommender.go` currently runs on synthetic fixture PRs
(`internal/diff/fixtures/`). Real PRs land in
[`Skund404/proto-commons`](https://github.com/Skund404/proto-commons) once
the suggestion intake bootstraps. To exercise the recommender on those:

1. `internal/git/patch.go` — parse the unified-diff text returned by
   `gh pr diff <num>` into the same `SemanticDiff` shape `DiffWorkingTree`
   produces.
2. `/api/diff?source=pr&num=<n>` switches from fixture lookup to the live
   parser when `s.GitHub` is wired and the PR is not in the fixture set.
3. `/api/prs` merges live PRs with fixture PRs (already wired) — once live
   parsing exists, the recommender output will flow for real contributions
   too.

Scope: ~300 LOC for the patch parser, no UI changes (the Review pane already
consumes `SemanticDiff` agnostic to source).

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
  public commons browser. Public browsing surface is the proto-commons repo
  itself + (later) a Docusaurus-rendered view.
- **Telemetry** — locked. Never.
