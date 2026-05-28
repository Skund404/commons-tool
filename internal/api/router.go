// Package api hosts the HTTP handlers for the commons maintainer tool.
//
// All endpoints bind on 127.0.0.1 and serve a single user. Authentication is
// out of scope; CORS is permissive for localhost dev only.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/Skund404/commons-tool/internal/indexer"
	"github.com/Skund404/commons-tool/internal/version"
)

// NewRouter returns an http.Handler wired with the v1 API routes. corpusRoot
// is the absolute path to a Proto-Commons corpus the server should serve.
func NewRouter(corpusRoot string) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"version": version.Version,
		})
	})

	mux.HandleFunc("/api/primitives", func(w http.ResponseWriter, r *http.Request) {
		corpus, err := indexer.LoadCorpus(corpusRoot, "primitives")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		out := make([]any, 0, len(corpus))
		for _, it := range corpus {
			out = append(out, map[string]any{
				"path":     it.Path,
				"document": it.Doc,
			})
		}
		writeJSON(w, http.StatusOK, out)
	})

	mux.HandleFunc("/api/indexes/resolve", func(w http.ResponseWriter, r *http.Request) {
		corpus, err := indexer.LoadCorpus(corpusRoot, "primitives")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, indexer.BuildResolveIndexes(corpus))
	})

	mux.HandleFunc("/api/indexes/taxonomy", func(w http.ResponseWriter, r *http.Request) {
		corpus, err := indexer.LoadCorpus(corpusRoot, "primitives")
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, indexer.BuildTaxonomyIndexes(corpus))
	})

	return cors(mux)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// cors permits localhost dev (frontend on 8431 talking to backend on 8430).
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
