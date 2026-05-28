# commons

Desktop maintainer tool for the OPG-L Proto-Commons.

`commons` is a single-binary Go + React app. It runs locally on `127.0.0.1`, opens in your browser, and lets a maintainer:

- **Author** new primitives (tool / material / technique / workflow / project / event) and bundles
- **Browse** the commons by kind, taxonomy, free-text, and federated source
- **Validate** the corpus against the OPG-L 0.6 strict spec + the Proto-Commons Record Format
- **Review** incoming pull requests with semantic diff analysis and severity-coded recommendations (REJECT / WARN / INFO / APPROVE)
- **Publish** local changes — stage, validate, preview diff, commit, push

It is **pre-Foundation infrastructure**. The OPG-L specification itself is maintained at [github.com/Skund404/proto-commons](https://github.com/Skund404/proto-commons); this tool is the maintainer's instrument for working with that commons.

## Platform support

- Linux (amd64)
- Windows (amd64)
- **macOS is not supported in v1** (intentionally deferred).

## Quick start

```bash
make dev        # backend + frontend dev servers in parallel
make build      # produce single binary in dist/
make verify-mock # validate against the reference mock corpus
```

After building, run `./dist/commons` (Linux) or `dist\commons.exe` (Windows). It binds the first available port from 8430 upward and opens your default browser.

## Architecture

| Layer | Tech | Role |
|---|---|---|
| Server | Go 1.22+, stdlib `net/http` | HTTP API, git ops, validator, indexer, diff engine |
| State | SQLite (`modernc.org/sqlite`, CGO-free) | recent primitives, search history, settings cache |
| Keys | OS keyring (Windows Credential Manager, Linux Secret Service) | emitter keypair, GitHub token cache |
| Frontend | React 18 + Vite + TypeScript + TanStack Query + Tailwind | 10-pane UI, embedded into the Go binary via `embed` |

The frontend talks to the backend exclusively over HTTP on `localhost`. There is **no remote sync, no telemetry, no multi-user state**. One maintainer, one process.

## Specifications

- [OPG-L 0.6 Formal Specification](../Rillmark/OPG-L/Spec%20Sheets/OPG-L_Formal_Specification_0.6.md) — primitive shape, lifecycle, hashing, linearity, append-only discipline
- [Proto-Commons Record Format 0.1](../Rillmark/_Processes/proto-commons-index-spec.md) — index format, bundles, federation
- This tool is the reference implementation for both.

## License

[CC-BY-4.0](LICENSE). The commons content it manages is also CC-BY-4.0.

## Project layout

```
commons-tool/
  cmd/commons/         entry point
  internal/
    hash/              RFC-8785 canonical JSON + SHA-256
    schema/            OPG-L 0.6 strict validator + bundle validator
    indexer/           resolve + taxonomy index generator (Go port of mock/scripts/generate-indexes.py)
    git/               go-git wrappers + semantic diff parser
    github/            gh CLI + go-github SDK for PR ops
    federation/        multi-root reader
    diff/              recommendation engine
    state/             SQLite layer
    keychain/          OS keyring abstraction
    config/            settings JSON
    api/               HTTP handlers
  frontend/            React + Vite + TS
  Makefile             build, test, cross-compile targets
  .github/workflows/   CI
```
