// Package api hosts the HTTP handlers for the commons maintainer tool.
//
// All endpoints bind on 127.0.0.1 and serve a single user. Authentication is
// out of scope; CORS is permissive for localhost dev only.
package api

import (
	"encoding/json"
	"io/fs"
	"net/http"

	"github.com/Skund404/commons-tool/internal/federation"
	gh "github.com/Skund404/commons-tool/internal/github"
	"github.com/Skund404/commons-tool/internal/keychain"
	"github.com/Skund404/commons-tool/internal/state"
)

// Server collects the dependencies the handlers share.
type Server struct {
	CorpusRoot     string
	SuggestionsDir string // F:\Rillmark\_Proto-Commons\suggestions or similar
	State          *state.Store
	Keychain       keychain.Keychain
	Federation     *federation.Manager
	GitHub         *gh.Client
	FrontendFS     fs.FS
}

// NewServer is the constructor used by main.go.
func NewServer(corpus, suggestions string) *Server {
	return &Server{
		CorpusRoot:     corpus,
		SuggestionsDir: suggestions,
	}
}

// Handler builds and returns the configured *http.ServeMux wrapped in CORS.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// health + read-only corpus
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("GET /api/primitives", s.handlePrimitivesList)
	mux.HandleFunc("POST /api/primitives", s.handlePrimitiveCreate)
	mux.HandleFunc("GET /api/primitives/{slug}", s.handlePrimitiveDetail)
	mux.HandleFunc("PUT /api/primitives/{slug}", s.handlePrimitiveUpdate)
	mux.HandleFunc("DELETE /api/primitives/{slug}", s.handlePrimitiveDelete)
	mux.HandleFunc("POST /api/primitives/{slug}/fork", s.handlePrimitiveFork)

	// drafts (UI-shape bodies, mutable, lifecycle: create → validate → stage)
	mux.HandleFunc("GET /api/drafts/primitives", s.handleDraftList)
	mux.HandleFunc("POST /api/drafts/primitives", s.handleDraftCreate)
	mux.HandleFunc("GET /api/drafts/primitives/{id}", s.handleDraftGet)
	mux.HandleFunc("PUT /api/drafts/primitives/{id}", s.handleDraftUpdate)
	mux.HandleFunc("DELETE /api/drafts/primitives/{id}", s.handleDraftDelete)
	mux.HandleFunc("POST /api/drafts/primitives/{id}/validate", s.handleDraftValidate)
	mux.HandleFunc("POST /api/drafts/primitives/{id}/stage", s.handleDraftStage)

	// indexes
	mux.HandleFunc("GET /api/indexes/resolve", s.handleResolveIndexes)
	mux.HandleFunc("GET /api/indexes/taxonomy", s.handleTaxonomyIndexes)
	mux.HandleFunc("POST /api/indexes/regenerate", s.handleRegenIndexes)

	// bundles CRUD
	mux.HandleFunc("GET /api/bundles", s.handleBundlesList)
	mux.HandleFunc("POST /api/bundles", s.handleBundleCreate)
	mux.HandleFunc("GET /api/bundles/{slug}", s.handleBundleGet)
	mux.HandleFunc("PUT /api/bundles/{slug}", s.handleBundleUpdate)
	mux.HandleFunc("DELETE /api/bundles/{slug}", s.handleBundleDelete)

	// diff + recommend
	mux.HandleFunc("GET /api/diff", s.handleDiff)
	mux.HandleFunc("POST /api/diff/recommend", s.handleRecommend)

	// PRs (mix of fixture and live gh)
	mux.HandleFunc("GET /api/prs", s.handlePRList)
	mux.HandleFunc("GET /api/prs/{num}", s.handlePRDetail)
	mux.HandleFunc("POST /api/prs/{num}/merge", s.handlePRMerge)
	mux.HandleFunc("POST /api/prs/{num}/comment", s.handlePRComment)
	mux.HandleFunc("POST /api/prs/{num}/review", s.handlePRReview)

	// suggestions feed (Discord/Reddit intake mirrored into vault)
	mux.HandleFunc("GET /api/suggestions", s.handleSuggestions)

	// settings
	mux.HandleFunc("GET /api/settings", s.handleSettingsGet)
	mux.HandleFunc("PUT /api/settings", s.handleSettingsPut)

	// publish wizard
	mux.HandleFunc("POST /api/publish/stage", s.handlePublishStage)
	mux.HandleFunc("POST /api/publish/commit", s.handlePublishCommit)

	// federation
	mux.HandleFunc("GET /api/federation/roots", s.handleFedList)
	mux.HandleFunc("POST /api/federation/roots", s.handleFedAdd)
	mux.HandleFunc("DELETE /api/federation/roots/{id}", s.handleFedRemove)
	mux.HandleFunc("POST /api/federation/roots/{id}/sync", s.handleFedSync)

	// dashboard support
	mux.HandleFunc("GET /api/commits", s.handleCommits)
	mux.HandleFunc("GET /api/changes/local", s.handleLocalChanges)

	if s.FrontendFS != nil {
		mux.Handle("/", http.FileServer(http.FS(s.FrontendFS)))
	}
	return cors(mux)
}

// NewRouter preserves the original signature for backwards compatibility with
// the existing main.go entry point. It constructs a default Server and returns
// its handler.
func NewRouter(corpusRoot string, frontendFS fs.FS) http.Handler {
	s := NewServer(corpusRoot, "")
	s.FrontendFS = frontendFS
	return s.Handler()
}

// cors permits localhost dev (Vite on 8431 talking to backend on 8430).
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:8431")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
