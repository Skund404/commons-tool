# Makefile for the `commons` desktop maintainer tool.
# Targets are POSIX-portable; tested on Linux and Git Bash on Windows.

GO       ?= go
NPM      ?= npm
NPX      ?= npx
BIN_NAME := commons
DIST_DIR := dist
FE_DIR   := frontend
EMBED_DIR := cmd/commons/frontend_dist
PKG      := github.com/Skund404/commons-tool
VERSION  := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS  := -s -w -X $(PKG)/internal/version.Version=$(VERSION)

# Detect host OS for default target
ifeq ($(OS),Windows_NT)
  HOST_OS := windows
  HOST_BIN := $(BIN_NAME).exe
else
  HOST_OS := $(shell uname -s | tr A-Z a-z)
  HOST_BIN := $(BIN_NAME)
endif

.PHONY: help dev backend-dev frontend-dev build build-linux build-windows test test-go test-fe e2e install-pw lint fmt verify-mock clean install-fe embed-frontend

help:
	@echo "Targets:"
	@echo "  dev            - run backend + frontend dev servers (parallel)"
	@echo "  backend-dev    - go run ./cmd/commons (loads frontend from filesystem)"
	@echo "  frontend-dev   - vite dev server (talks to backend on 8430)"
	@echo "  build          - frontend bundle + embed + Go binary for host OS in dist/"
	@echo "  build-linux    - cross-compile Linux amd64 binary"
	@echo "  build-windows  - cross-compile Windows amd64 binary"
	@echo "  test           - go test + frontend tests"
	@echo "  test-go        - go test only"
	@echo "  test-fe        - frontend unit tests"
	@echo "  e2e            - full Playwright suite against the embedded binary"
	@echo "  install-pw     - install Playwright + chromium browser"
	@echo "  lint           - golangci-lint + eslint"
	@echo "  fmt            - gofmt + prettier"
	@echo "  verify-mock    - validate the tool against ../Rillmark/_Proto-Commons/mock"
	@echo "  clean          - remove dist/, frontend/dist, embed dir contents, runtime/"

install-fe:
	cd $(FE_DIR) && $(NPM) install

frontend-dev: install-fe
	cd $(FE_DIR) && $(NPM) run dev

backend-dev:
	COMMONS_DEV=1 $(GO) run ./cmd/commons

dev:
	@$(MAKE) -j2 backend-dev frontend-dev

frontend-build: install-fe
	cd $(FE_DIR) && $(NPM) run build

# Stage the built frontend into the //go:embed target so the next Go build
# bundles the React app. Idempotent: always wipes the embed dir except for
# the tracked .gitkeep, then copies the freshest frontend/dist contents in.
embed-frontend: frontend-build
	@mkdir -p $(EMBED_DIR)
	@find $(EMBED_DIR) -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +
	@cp -r $(FE_DIR)/dist/. $(EMBED_DIR)/

build: embed-frontend
	mkdir -p $(DIST_DIR)
	$(GO) build -trimpath -ldflags '$(LDFLAGS)' -o $(DIST_DIR)/$(HOST_BIN) ./cmd/commons

build-linux: embed-frontend
	mkdir -p $(DIST_DIR)
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		$(GO) build -trimpath -ldflags '$(LDFLAGS)' -o $(DIST_DIR)/$(BIN_NAME)-linux-amd64 ./cmd/commons

build-windows: embed-frontend
	mkdir -p $(DIST_DIR)
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
		$(GO) build -trimpath -ldflags '$(LDFLAGS)' -o $(DIST_DIR)/$(BIN_NAME)-windows-amd64.exe ./cmd/commons

test: test-go test-fe

test-go:
	$(GO) test ./... -count=1

test-fe:
	cd $(FE_DIR) && $(NPM) test --silent --if-present

# Install Playwright (devDep) + the chromium-headless-shell. Safe to re-run;
# npm install is idempotent and `npx playwright install` only downloads
# missing browsers.
install-pw: install-fe
	cd $(FE_DIR) && $(NPM) install -D @playwright/test
	cd $(FE_DIR) && $(NPX) playwright install chromium

# Full e2e: build the embedded binary, then drive it from headless chromium.
# Depends on build so the Playwright config can launch dist/commons(.exe)
# directly; assumes the chromium browser is already installed (run
# `make install-pw` once on a fresh machine).
e2e: build
	cd $(FE_DIR) && $(NPX) playwright test

lint:
	@command -v golangci-lint >/dev/null 2>&1 && golangci-lint run || echo "golangci-lint not installed; skipping"
	cd $(FE_DIR) && $(NPM) run lint --if-present

fmt:
	$(GO) fmt ./...
	cd $(FE_DIR) && $(NPM) run format --if-present

verify-mock:
	$(GO) run ./cmd/commons verify-mock --mock ../Rillmark/_Proto-Commons/mock

clean:
	rm -rf $(DIST_DIR) $(FE_DIR)/dist $(FE_DIR)/node_modules runtime
	@find $(EMBED_DIR) -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} + 2>/dev/null || true
