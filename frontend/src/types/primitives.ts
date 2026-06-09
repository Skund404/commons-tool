// TypeScript types for the OPG-L primitives, bundles, indexes, PRs, and tool-state
// records the UI manipulates. These mirror the shape of the canonical JSON records
// defined in:
//   - OPG-L 0.6 Formal Specification (§3, §4, §10, §15)
//   - Proto-Commons Record Format 0.1 (§5, §6, §7)
//
// The backend's Zod-validated wire schemas are the source of truth; these UI types
// are a TypeScript projection that focuses on what panes render and edit.

export type PrimitiveKind =
  | "tool"
  | "material"
  | "technique"
  | "workflow"
  | "project"
  | "event";

export type LifecycleState = "draft" | "validated" | "staged" | "published" | "regen";

export type Severity = "approve" | "warn" | "reject" | "info";

// OPG-L 0.6 §4.2
export type ProvenanceState = "unasserted" | "asserted" | "unknown" | "external";

// OPG-L 0.6 §4.3
export type Outcome =
  | "succeeded"
  | "failed"
  | "partial"
  | "aborted"
  | "superseded"
  | "unknown";

export type BundleRole = "required" | "recommended" | "optional";

export type LocalizedNames = Record<
  string, // language code, e.g. "en", "de", "fr", "ja"
  {
    canonical: string;
    aliases: string[];
  }
>;

export type LocalizedBundleName = Record<
  string,
  {
    name: string;
    desc: string;
  }
>;

export interface Relationship {
  type:
    | "uses_tool"
    | "uses_material"
    | "applies_technique"
    | "composed_of"
    | "specializes"
    | "predecessor"
    | "derived_from";
  target: string; // slug of the related primitive
}

export interface DomainTool {
  category: string | null;
  manufacturer: string | null;
}
export interface DomainMaterial {
  materialType: string;
  unit: string;
}
export interface DomainTechnique {
  skillLevel: "beginner" | "intermediate" | "advanced";
  steps: number;
}
export interface DomainWorkflow {
  difficulty: "beginner" | "intermediate" | "advanced";
  steps: number;
}

export type Domain =
  | DomainTool
  | DomainMaterial
  | DomainTechnique
  | DomainWorkflow
  | Record<string, never>;

export interface Primitive {
  id: string;
  kind: PrimitiveKind;
  name: string;
  slug: string;
  desc: string;
  hash: string;
  emitter: string; // opg://<uuid>
  license: "CC-BY-4.0";
  state: LifecycleState;
  tags: string[];
  names: LocalizedNames;
  specializes: string | null; // legacy: parent primitive slug (still a valid rel, no longer taxonomy)
  taxonomy?: string | null; // category-membership id (addendum §A.3); the taxonomy join
  rel: Relationship[];
  domain: Domain;
  // Lineage block (§4.4) — most commons primitives sit at the floor.
  provenanceState?: ProvenanceState;
  outcome?: Outcome;
  // URL-only media refs (no embedded blobs in the commons)
  media?: { url: string; caption?: string }[];
}

export interface BundleItem {
  kind: PrimitiveKind | "bundle";
  slug: string;
  role: BundleRole;
  note?: Record<string, string>; // localized {lang: string} (addendum §B.3)
}

// addendum §B.6 — append-only, hash-excluded forward pointer to a standalone
// successor bundle. Carries no role.
export interface BundleSuccessor {
  target: string; // successor bundle by slug or hash
  note?: Record<string, string>; // localized explanation
  change_impact?: string; // open vocabulary (drop-in / footprint-ripple / …)
  added?: string;
}

export interface Bundle {
  id: string;
  slug: string;
  hash: string;
  emitter: string;
  license: "CC-BY-4.0";
  state: LifecycleState; // UI lifecycle (draft/validated/staged/published)
  lifecycle?: "open" | "closed"; // bundle open/closed lifecycle (addendum §B.5)
  names: LocalizedBundleName;
  items: BundleItem[];
  successors?: BundleSuccessor[];
  tags?: string[]; // domain-first, e.g. ["leatherwork","kit"]
}

export interface FederationRoot {
  id: string;
  name: string;
  url: string;
  role: "primary" | "read";
  lastSync: string;
  primCount: number;
  language: string[];
  craft?: string;
}

export interface DiffFile {
  op: "+" | "M" | "-";
  path: string;
  added?: number;
  removed?: number;
}

export interface Recommendation {
  sev: Severity;
  title: string;
  body?: string;
  file?: string;
  hash?: string;
  suggest?: string;
}

export interface PullRequest {
  id: number;
  title: string;
  author: string;
  authorMeta: string;
  age: string;
  branch: string;
  files: DiffFile[];
  semantic: string[];
  recs: Recommendation[];
  /** GitHub URL. Present on live PRs; empty for fixture PRs. */
  url?: string;
}

export interface LocalChange {
  op: "+" | "M" | "-";
  path: string;
  state: LifecycleState;
  slug: string;
  kind: PrimitiveKind | "bundle" | "index";
}

export interface Suggestion {
  id: string;
  title: string;
  source: string;
  captured: string;
  status: "open" | "authoring" | "published" | "declined";
  lang: string;
  body: string;
  declineReason?: string;
}

export interface Commit {
  sha: string;
  author: string;
  time: string;
  msg: string;
}
