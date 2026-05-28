// TanStack Query hooks for every backend endpoint a pane consumes.
//
// Each hook returns a typed query/mutation. Panes use these in place of the
// static fixture imports they used during initial design.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  Bundle,
  Commit,
  FederationRoot,
  LocalChange,
  Primitive,
  PullRequest,
  Suggestion,
} from "@/types/primitives";

// ─────────── primitives ───────────

export function usePrimitives() {
  return useQuery({
    queryKey: ["primitives"],
    queryFn: () => api.get<Primitive[]>("/api/primitives"),
  });
}

export function usePrimitive(slug: string | null) {
  return useQuery({
    queryKey: ["primitive", slug],
    queryFn: () => api.get<Primitive>(`/api/primitives/${slug}`),
    enabled: !!slug,
  });
}

// ─────────── bundles ───────────

export function useBundles() {
  return useQuery({
    queryKey: ["bundles"],
    queryFn: () => api.get<Bundle[]>("/api/bundles"),
  });
}

export function useBundle(slug: string | null) {
  return useQuery({
    queryKey: ["bundle", slug],
    queryFn: () => api.get<Bundle>(`/api/bundles/${slug}`),
    enabled: !!slug,
  });
}

// ─────────── indexes ───────────

export type ResolveIndex = Record<
  string,
  Record<string, ResolveEntry | ResolveEntry[]>
>;
export interface ResolveEntry {
  hash: string;
  path: string;
  kind: string;
  canonical: boolean;
}
export function useResolveIndexes() {
  return useQuery({
    queryKey: ["indexes", "resolve"],
    queryFn: () => api.get<ResolveIndex>("/api/indexes/resolve"),
  });
}

export interface TaxNode {
  slug: string;
  kind: string;
  hash: string;
  path: string;
  name: string;
  children: TaxNode[];
}
export type TaxonomyIndex = Record<string, Record<string, TaxNode>>;
export function useTaxonomyIndexes() {
  return useQuery({
    queryKey: ["indexes", "taxonomy"],
    queryFn: () => api.get<TaxonomyIndex>("/api/indexes/taxonomy"),
  });
}

export function useRegenerateIndexes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>("/api/indexes/regenerate", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indexes"] });
      qc.invalidateQueries({ queryKey: ["primitives"] });
    },
  });
}

// ─────────── PRs ───────────

export function usePRs() {
  return useQuery({
    queryKey: ["prs"],
    queryFn: () => api.get<PullRequest[]>("/api/prs"),
  });
}

export function usePR(num: number | null) {
  return useQuery({
    queryKey: ["pr", num],
    queryFn: () => api.get<PullRequest>(`/api/prs/${num}`),
    enabled: num !== null,
  });
}

export function useMergePR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ num, method }: { num: number; method?: string }) =>
      api.post<{ ok: boolean; dry_run: boolean }>(`/api/prs/${num}/merge`, {
        method: method ?? "squash",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prs"] }),
  });
}

export function useCommentPR() {
  return useMutation({
    mutationFn: ({ num, body }: { num: number; body: string }) =>
      api.post<{ ok: boolean }>(`/api/prs/${num}/comment`, { body }),
  });
}

export function useReviewPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      num,
      verdict,
      body,
    }: {
      num: number;
      verdict: "approve" | "request" | "comment";
      body: string;
    }) =>
      api.post<{ ok: boolean }>(`/api/prs/${num}/review`, { verdict, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prs"] }),
  });
}

// ─────────── suggestions ───────────

export function useSuggestions() {
  return useQuery({
    queryKey: ["suggestions"],
    queryFn: () => api.get<Suggestion[]>("/api/suggestions"),
  });
}

// ─────────── status ───────────

export interface CorpusStatus {
  corpus_root: string;
  primitives: number;
  bundles: number;
  open_prs: number;
  cycle_errors: string[] | null;
  validator_ok: boolean;
  last_validated: string;
}
export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => api.get<CorpusStatus>("/api/status"),
  });
}

// ─────────── commits ───────────

export function useCommits() {
  return useQuery({
    queryKey: ["commits"],
    queryFn: () => api.get<Commit[]>("/api/commits"),
  });
}

// ─────────── local changes ───────────

export function useLocalChanges() {
  return useQuery({
    queryKey: ["changes", "local"],
    queryFn: () => api.get<LocalChange[]>("/api/changes/local"),
  });
}

// ─────────── settings ───────────

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Record<string, unknown>>("/api/settings"),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put<{ ok: boolean }>("/api/settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

// ─────────── federation ───────────

export function useFederationRoots() {
  return useQuery({
    queryKey: ["federation", "roots"],
    queryFn: () => api.get<FederationRoot[]>("/api/federation/roots"),
  });
}

export function useAddFederationRoot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (root: Partial<FederationRoot> & { id: string; url: string }) =>
      api.post<FederationRoot>(`/api/federation/roots?clone=0`, root),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["federation"] }),
  });
}

export function useRemoveFederationRoot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/api/federation/roots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["federation"] }),
  });
}

// ─────────── publish ───────────

export function usePublishStage() {
  return useQuery({
    queryKey: ["publish", "stage"],
    queryFn: () => api.get<unknown>("/api/publish/stage"),
    enabled: false, // call explicitly via refetch()
  });
}

export function usePublishCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      message: string;
      author: string;
      email: string;
      paths?: string[];
      push?: boolean;
    }) => api.post<{ sha: string; pushed?: boolean; push_error?: string }>("/api/publish/commit", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["changes"] });
      qc.invalidateQueries({ queryKey: ["commits"] });
    },
  });
}

// ─────────── health ───────────

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<{ ok: boolean; version: string }>("/api/health"),
    staleTime: 0,
  });
}
