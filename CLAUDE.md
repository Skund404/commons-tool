# CLAUDE.md — commons (Proto-Commons maintainer tool)

Read this at the start of every session. `commons` is the maintainer's instrument
for the OPG-L Proto-Commons: a single-binary **Go HTTP API + embedded React UI**
that runs on `127.0.0.1`, one maintainer / one process — no remote sync, no
telemetry, no multi-user state. See `README.md` for the user-facing tour and
`ROADMAP.md` for direction.

Module path: `github.com/Skund404/commons-tool`. Go **1.24**. macOS is
intentionally unsupported (Linux + Windows amd64 only).

---

## Maintenance discipline (keep this file lean)

Load-bearing rules only — not history. No changelogs ("fixed X on date Y" → git
log). No file inventories (glob a dir). Delete falsified claims, don't annotate
them. Status flags rot — re-verify or cut. Don't paste code that lives in code.

---

## Build / run / test

```bash
make dev          # backend + Vite dev servers in parallel
make build        # frontend bundle → embed → single Go binary in dist/
make test         # go test ./... + frontend tests
make verify-mock  # the drift gate (see below); default MOCK_PATH=../Rillmark/_Proto-Commons/mock
go test ./...     # Go unit/integration tests
```

The built binary serves the API and the embedded UI; `make build` runs
`embed-frontend` (Vite build → `cmd/commons/frontend_dist/`) before `go build`.
After touching `frontend/`, rebuild the embed or the binary serves stale UI.

CLI subcommands (binary or `go run ./cmd/commons <sub>`): `verify-mock`,
`intake-incoming`, `version`; bare invocation starts the server.

---

## Data format — the Index & Bundle Addendum 1.0 (the crux)

This tool is the **reference implementation** of the OPG-L 0.6 **Index & Bundle
Data-Format Addendum 1.0** (`../Rillmark/_Processes/opg-l-index-bundle-addendum.md`,
supersedes the Record Format 0.3). The vault mock
(`../Rillmark/_Proto-Commons/mock/`) + its `scripts/generate-indexes.py` are the
**normative reference**; this tool must reproduce them.

- **Index = an authored category skeleton + a derived projection.** Categories
  (`indexes/categories/<id>.json`) are **index-native nodes, NOT a 7th primitive
  kind**. A category specializes at most one parent **by id** (a forest);
  `related` is discovery. Primitives declare membership via
  `properties.taxonomy: "<category-id>"` — **not** a `specializes` relationship
  (that's retired for taxonomy).
- **Derived projection** (regenerated, never hand-edited): `indexes/manifest.json`
  + cross-lingual denormalized `resolve/<lang>.json` (`{format_version, entries:
  {key: [{ref,class,kind,name,lang,canonical}]}}`, values always lists, indexes
  categories AND primitives) + category-tree `taxonomy/<lang>.json`
  (`{format_version, tree: {"category/<id>": {id,name,parent,members,related,children}}}`).
- **Bundle** = hash-pinned assortment. Carries `format_version`, `state`
  (`open` mutable | `closed` frozen-citation), localized item `note`
  (`{lang: string}`), and **append-only `successors`**. `successors` is
  **excluded from `content_hash`** so a closed bundle's frozen identity survives
  appends.

### Load-bearing invariants

1. **`commons verify-mock --dry-run` is the drift gate.** The Go indexer
   (`internal/indexer`) must reproduce the mock's `manifest.json` + `resolve/` +
   `taxonomy/` **byte-for-byte**. Output is deterministic: 2-space indent, sorted
   map keys, no `<>&` escaping, **LF**, trailing newline. Struct field order
   reproduces the Python dict insertion order.
2. **Normalization (§A.6) is pinned by `internal/indexer/testdata/normalization-vectors.json`**
   (mirror of the mock's `fixtures/`). NFC → Unicode full case-fold
   (`golang.org/x/text/cases.Fold`, NOT `ToLower`) → NFC → collapse → trim. Don't
   change `NormalizeKey` without updating the vectors in lock-step.
3. **Bundle hashing uses `hash.ComputeBundle`, never `hash.Compute`** — it strips
   `successors` from the preimage. Apply it at every bundle-hash site (intake,
   diff fixtures, diff gateHash).
4. **LF everywhere.** The mock + this repo pin `*.json`/`*.py` to LF via
   `.gitattributes`. Windows text-mode tooling reintroducing CRLF breaks the
   byte-identity gate. The mock generator writes `newline="\n"`.

---

## Code layout & where to change things

```
cmd/commons/main.go        entry; subcommand dispatch; verify-mock (drift gate);
                           intake-incoming; serve. frontend_dist/ is the embed target.
internal/
  indexer/   the category-skeleton index generator + NormalizeKey + Regenerate.
             Mirror generate-indexes.py exactly. Category/Entry/TaxNode/Manifest types.
  schema/    strict validators: primitive.go, bundle.go (format_version/state/
             successors/localized note). Category skeleton+membership validation
             lives in indexer (ValidateSkeleton/ValidateMembership) to avoid a
             schema↔indexer import cycle.
  hash/      RFC-8785 canonical JSON + SHA-256. Compute (primitives) +
             ComputeBundle (strips successors).
  api/       HTTP handlers. handlers.go (status/resolve/taxonomy/regen),
             primitives_write.go (UI→spec write pipeline + taxonomy-membership gate),
             projection.go / projection_reverse.go (UI↔spec adapter; taxonomy field),
             intake*.go (paste + contributions/incoming explode → canonical),
             drafts.go, live_pr.go.
  diff/      PR review recommendation engine (gates.go, heuristics.go, recommender).
             gateHash recomputes hashes (ComputeBundle for bundles); gateCycle is a
             no-op now (taxonomy cycles moved to the category skeleton).
  git/ github/ federation/ keychain/ state/ version/   git ops, gh/PR, multi-root,
             OS keyring, SQLite cache, version string.
frontend/src/ panes/ (editor, bundle, taxonomy, indexes, browser, publish, review,
             intake, dashboard, federation, settings), api/{client,hooks}, types/primitives.ts.
```

- New index shape → `internal/indexer` (and keep the mock generator + vectors in sync).
- New validator rule → `internal/schema` (named `checkX`); category/membership rules → `indexer`.
- New API route → `internal/api/router.go` + a handler.
- Index/taxonomy viewer or bundle authoring UI → the matching `frontend/src/panes/*`;
  the typed index/bundle shapes live in `frontend/src/api/hooks.ts` + `types/primitives.ts`.

---

## Publishing the commons (`Skund404/proto-commons`)

The published repo has **two branches with different corpora**:

- **`main`** (default) = the **carbonara/kitchen** corpus. This is what HideSync's
  browse + the category picker read (`PROTO_COMMONS_BRANCH="main"`).
- **`test-corpus`** = the **leatherwork** corpus = the vault mock; what CI / Go
  integration tests use (`make fetch-mock` clones it into `.cache/proto-commons`).

**Author + publish from a clean full clone** (e.g. `F:\Rillmark-Workspace\proto-commons-pub`),
`git -c core.autocrlf=false`. **Do NOT author or push from `.cache/proto-commons`** —
it is a shallow single-branch cache that `make fetch-mock` resets, and it carries
autocrlf churn + can hold divergent unpushed commits.

Reindex a corpus with `commons verify-mock --mock <clone> --dry-run=false` (writes
manifest + resolve + taxonomy), then `--dry-run` to confirm byte-identity, before
committing.

**Hash caveat (carbonara/main):** the carbonara primitives' published
`content_hash`es were historically NOT reproducible by this tool's RFC-8785 hasher
(produced by a different/older hasher; the bundle hash WAS canonical). When editing
them, re-stamp to canonical `hash.Compute` values and re-pin the bundle. The
leatherwork mock/test-corpus use placeholder hashes, so this only bites on main.

---

## Gotchas

- **Stale embed.** UI changes don't show until `make build`/`embed-frontend` re-stages `frontend_dist/`.
- **`go run ./cmd/commons verify-mock`** is the fastest end-to-end check after any
  indexer/schema/hash change — it loads the mock, validates skeleton + membership +
  bundles, and byte-compares the regenerated indexes.
- **gh auth** drives PR ops; without it the PR list falls back to fixtures.
- The `internal/` packages can't be imported outside the module — throwaway probes
  go in a temp `cmd/<name>/main.go` inside the repo, then delete.
