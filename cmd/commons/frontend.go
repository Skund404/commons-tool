package main

import (
	"embed"
	"io/fs"
)

// frontendFS embeds the built frontend assets. When the binary is built
// without a prior `npm run build`, frontend/dist/ may be missing; in that
// case we degrade gracefully (the API still serves; the UI 404s).
//
//go:embed all:frontend_dist
var frontendFS embed.FS

// frontendRoot returns the embedded fs rooted at frontend_dist/ so file paths
// resolve as "index.html" rather than "frontend_dist/index.html".
func frontendRoot() (fs.FS, error) {
	return fs.Sub(frontendFS, "frontend_dist")
}
