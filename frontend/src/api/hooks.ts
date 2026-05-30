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

// ─────────── primitives (read) ───────────

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

// ─────────── primitives (write) ───────────

export interface IntegrationResult {
  primitive: Record<string, unknown>;
  ui: Primitive;
  warnings?: string[];
}

function invalidateCorpusViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["primitives"] });
  qc.invalidateQueries({ queryKey: ["indexes"] });
  qc.invalidateQueries({ queryKey: ["taxonomy"] });
  qc.invalidateQueries({ queryKey: ["status"] });
}

export function useCreatePrimitive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Primitive>) =>
      api.post<IntegrationResult>("/api/primitives", body),
    onSuccess: () => invalidateCorpusViews(qc),
  });
}

export function useUpdatePrimitive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: Partial<Primitive> }) =>
      api.put<IntegrationResult>(`/api/primitives/${slug}`, body),
    onSuccess: () => invalidateCorpusViews(qc),
  });
}

export function useDeletePrimitive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      api.del<{ ok: boolean; deleted: string }>(`/api/primitives/${slug}`),
    onSuccess: () => invalidateCorpusViews(qc),
  });
}

export function useForkPrimitive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceSlug,
      overrides,
    }: {
      sourceSlug: string;
      overrides?: Partial<Primitive>;
    }) =>
      api.post<IntegrationResult>(
        `/api/primitives/${sourceSlug}/fork`,
        overrides ?? {},
      ),
    onSuccess: () => invalidateCorpusViews(qc),
  });
}

// ─────────── intake (paste → preview → queue) ───────────

export interface IntakeItem {
  index: number;
  source: "spec" | "ui" | "unknown";
  slug?: string;
  kind?: string;
  name?: string;
  ui_body?: Record<string, unknown>;
  error?: string;
  conflict?: string;
}

export interface IntakeParseResult {
  items: IntakeItem[];
  ok_count: number;
  errors: number;
}

export interface IntakeQueueResult {
  drafts: DraftEnvelope[];
  errors?: string[];
}

export function useIntakeParse() {
  return useMutation({
    mutationFn: (text: string) =>
      api.post<IntakeParseResult>("/api/intake/parse", { text }),
  });
}

export function useIntakeQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Record<string, unknown>[]) =>
      api.post<IntakeQueueResult>("/api/intake/queue", { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drafts"] }),
  });
}

// ─────────── draft lifecycle ───────────

export interface DraftEnvelope {
  id: string;
  slug?: string;
  kind?: string;
  title?: string;
  created_at: string;
  modified_at: string;
  body: Partial<Primitive>;
}

export interface DraftValidationResult {
  ok: boolean;
  errors?: Array<{ field: string; sev: "reject" | "warn"; message: string }>;
}

export function useDrafts() {
  return useQuery({
    queryKey: ["drafts"],
    queryFn: () => api.get<DraftEnvelope[]>("/api/drafts/primitives"),
  });
}

export function useDraft(id: string | null) {
  return useQuery({
    queryKey: ["draft", id],
    queryFn: () => api.get<DraftEnvelope>(`/api/drafts/primitives/${id}`),
    enabled: !!id,
  });
}

export function useCreateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Primitive>) =>
      api.post<DraftEnvelope>("/api/drafts/primitives", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drafts"] }),
  });
}

export function useUpdateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Primitive> }) =>
      api.put<DraftEnvelope>(`/api/drafts/primitives/${id}`, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      qc.invalidateQueries({ queryKey: ["draft", id] });
    },
  });
}

export function useValidateDraft() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<DraftValidationResult>(
        `/api/drafts/primitives/${id}/validate`,
        {},
      ),
  });
}

export function useStageDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<IntegrationResult>(`/api/drafts/primitives/${id}/stage`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      invalidateCorpusViews(qc);
    },
  });
}

export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.del<{ ok: boolean; deleted: string }>(`/api/drafts/primitives/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drafts"] }),
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

// Resolve projection (addendum §A.5): denormalized, cross-lingual, entries are
// always lists. One ResolveFile per language under /api/indexes/resolve.
export interface ResolveEntry {
  ref: string; // categories/<id> | primitives/<kind>s/<slug>.json
  class: "category" | "primitive";
  kind: string | null; // six-kind for primitives; null for categories
  name: string; // matched surface name
  lang: string;
  canonical: boolean;
}
export interface ResolveFile {
  format_version: string;
  entries: Record<string, ResolveEntry[]>;
}
export type ResolveIndex = Record<string, ResolveFile>; // {lang: ResolveFile}
export function useResolveIndexes() {
  return useQuery({
    queryKey: ["indexes", "resolve"],
    queryFn: () => api.get<ResolveIndex>("/api/indexes/resolve"),
  });
}

// Taxonomy projection (addendum §A.7): category tree with attached primitive
// members. One TaxonomyFile per language under /api/indexes/taxonomy.
export interface TaxMember {
  ref: string;
  slug: string;
  kind: string;
  name: string;
}
export interface TaxNode {
  id: string;
  name: string;
  parent: string | null;
  members: TaxMember[];
  related: string[];
  children: TaxNode[];
}
export interface TaxonomyFile {
  format_version: string;
  tree: Record<string, TaxNode>; // keyed "category/<id>"
}
export type TaxonomyIndex = Record<string, TaxonomyFile>; // {lang: TaxonomyFile}
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
  categories: number;
  bundles: number;
  open_prs: number;
  skeleton_errors: string[] | null;
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
