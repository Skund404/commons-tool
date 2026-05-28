# Makefile for the `commons` desktop maintainer tool.
# Targets are POSIX-portable; tested on Linux and Git Bash on Windows.

GO       ?= go
NPM      ?= npm
BIN_NAME := commons
DIST_DIR := dist
FE_DIR   := frontend
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

.PHONY: help dev backend-dev frontend-dev build build-linux build-windows test lint fmt verify-mock clean install-fe

help:
	@echo "Targets:"
	@echo "  dev            — run backend + frontend dev servers (parallel)"
	@echo "  backend-dev    — go run ./cmd/commons (loads frontend from filesystem)"
	@echo "  frontend-dev   — vite dev server (talks to backend on 8430)"
	@echo "  build          — frontend bundle + Go binary for host OS in dist/"
	@echo "  build-linux    — cross-compile Linux amd64 binary"
	@echo "  build-windows  — cross-compile Windows amd64 binary"
	@echo "  test           — go test + npm test"
	@echo "  lint           — golangci-lint + eslint"
	@echo "  fmt            — gofmt + prettier"
	@echo "  verify-mock    — validate the tool against ../Rillmark/_Proto-Commons/mock"
	@echo "  clean          — remove dist/, frontend/dist, runtime/"

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

build: frontend-build
	mkdir -p $(DIST_DIR)
	$(GO) build -trimpath -ldflags '$(LDFLAGS)' -o $(DIST_DIR)/$(HOST_BIN) ./cmd/commons

build-linux: frontend-build
	mkdir -p $(DIST_DIR)
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		$(GO) build -trimpath -ldflags '$(LDFLAGS)' -o $(DIST_DIR)/$(BIN_NAME)-linux-amd64 ./cmd/commons

build-windows: frontend-build
	mkdir -p $(DIST_DIR)
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
		$(GO) build -trimpath -ldflags '$(LDFLAGS)' -o $(DIST_DIR)/$(BIN_NAME)-windows-amd64.exe ./cmd/commons

test:
	$(GO) test ./... -count=1
	cd $(FE_DIR) && $(NPM) test --silent --if-present

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
