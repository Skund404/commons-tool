# Contributing to `commons`

This repository hosts the desktop maintainer tool. For **contributing primitives to the Proto-Commons content corpus**, go to [Skund404/proto-commons](https://github.com/Skund404/proto-commons) — that's the data, not the tool.

## Reporting issues

Open a GitHub issue. Include:

- Operating system and version
- `commons --version`
- Steps to reproduce
- Expected vs. actual behavior
- Relevant log output (the tool writes a session log to the runtime directory)

## Code contributions

### Setup

```bash
git clone https://github.com/Skund404/commons-tool
cd commons-tool
make dev
```

You need:

- Go 1.22+
- Node.js 20+
- `gh` CLI (authenticated) for running PR-related tests

### Conventions

- **Go:** standard `gofmt`, `golangci-lint` clean, `go test ./...` passing. Tests live next to the code they test.
- **TypeScript:** ESLint clean, no `any` (rare exceptions explained inline).
- **No external network calls except** to GitHub via `gh` / `go-github`, and to clone configured federation roots. All other operations are local.
- **No telemetry. Ever.**

### Branching

- `main` is always shippable.
- Topic branches off `main`. Name them `feat/<short>`, `fix/<short>`, `chore/<short>`.

### Commits

Conventional commits encouraged but not enforced. Keep them small. Keep the diff legible.

### Tests

Run before opening a PR:

```bash
make test
make lint
make verify-mock
```

`verify-mock` is non-optional: it ensures the validator + indexer remain byte-compatible with the canonical mock corpus.

## License

By contributing, you agree your contributions are licensed under [CC-BY-4.0](LICENSE).
