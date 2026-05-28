import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  DeleteConfirmModal,
  Hash,
  I,
  Input,
  KIND_ICON,
  KIND_LABEL,
  KindGlyph,
  Modal,
  Segmented,
  SeverityDot,
  SEV,
  StateBadge,
  Tabs,
  Toolbar,
} from "@/components";
import { PASCAL_EMITTER_URI } from "@/fixtures";
import {
  usePrimitives,
  useCreatePrimitive,
  useUpdatePrimitive,
  useDeletePrimitive,
  useForkPrimitive,
  useCreateDraft,
  useUpdateDraft,
  useValidateDraft,
  useStageDraft,
  useDeleteDraft,
  type DraftValidationResult,
} from "@/api/hooks";
import type { PaneArgs } from "@/shell/pane-switch";
import type { PaneId } from "@/nav";
import type {
  Outcome,
  Primitive,
  PrimitiveKind,
  ProvenanceState,
  Relationship,
  Severity,
} from "@/types/primitives";

type LangKey = "en" | "de" | "fr" | "ja";
type SectionId = "identity" | "i18n" | "domain" | "rel" | "lineage" | "media";

interface PaneEditorProps {
  slug?: string;
  fresh?: boolean;
  fork?: string;
  onFork?: (id: string) => void;
  onDelete?: () => void;
  go?: (id: PaneId, args?: PaneArgs) => void;
}

interface Issue {
  sev: Severity;
  field: string;
  msg: string;
}

const SCRATCH_AWL_TEMPLATE: Primitive = {
  id: "scratch-awl",
  slug: "scratch-awl",
  kind: "tool",
  name: "Scratch Awl",
  desc: "A single-point awl used for marking out stitching lines and laying out cuts on leather. Distinct from a piercing awl.",
  hash: "sha256:9b3c1f4e2a6d7b8c1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
  emitter: PASCAL_EMITTER_URI,
  license: "CC-BY-4.0",
  state: "draft",
  tags: ["piercing", "layout"],
  names: {
    en: { canonical: "scratch awl", aliases: ["awl"] },
    de: { canonical: "Vorstecher", aliases: [] },
    fr: { canonical: "", aliases: [] },
  },
  specializes: "awl",
  rel: [{ type: "specializes", target: "awl" }],
  domain: { category: "piercing", manufacturer: "" },
};

export function PaneEditor({ slug, fresh, fork, onFork, onDelete, go }: PaneEditorProps) {
  const { data: PRIMS = [] } = usePrimitives();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitcherOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const start = useMemo<Primitive>(() => {
    if (fork) {
      const source = PRIMS.find((p) => p.id === fork);
      if (source) {
        return {
          ...source,
          id: `${source.id}-fork`,
          slug: `${source.slug}-variant`,
          name: `${source.name} (fork)`,
          hash: "sha256:" + "0".repeat(63) + "f",
          state: "draft",
          tags: [...source.tags],
          names: JSON.parse(JSON.stringify(source.names)) as Primitive["names"],
          specializes: source.id,
          rel: [
            { type: "specializes", target: source.id },
            { type: "predecessor", target: source.id },
          ],
        };
      }
    }
    if (!fresh && slug) {
      const found = PRIMS.find((p) => p.id === slug);
      if (found) return found;
    }
    return SCRATCH_AWL_TEMPLATE;
  }, [slug, fresh, fork, PRIMS]);

  const [p, setP] = useState<Primitive>(start);
  const [activeLang, setActiveLang] = useState<LangKey>("en");
  const [section, setSection] = useState<SectionId>("identity");
  const [saved, setSaved] = useState(false);
  const [picker, setPicker] = useState<{ type: Relationship["type"] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [remoteIssues, setRemoteIssues] = useState<
    DraftValidationResult["errors"]
  >(undefined);
  const [banner, setBanner] = useState<{ kind: "ok" | "warn" | "err"; msg: string } | null>(
    null,
  );

  // Mutations.
  const createPrim = useCreatePrimitive();
  const updatePrim = useUpdatePrimitive();
  const deletePrim = useDeletePrimitive();
  const forkPrim = useForkPrimitive();
  const createDraft = useCreateDraft();
  const updateDraft = useUpdateDraft();
  const validateDraft = useValidateDraft();
  const stageDraft = useStageDraft();
  const deleteDraft = useDeleteDraft();

  // Whether the primitive currently in the editor already lives in the corpus.
  const isExistingPrimitive = !fresh && !!slug && PRIMS.some((x) => x.id === slug || x.slug === slug);

  useEffect(() => {
    setP(start);
    setDraftId(null);
    setRemoteIssues(undefined);
    setBanner(null);
  }, [start]);

  // Surface banners briefly then clear them.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), banner.kind === "err" ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [banner]);

  async function handleSaveDraft() {
    try {
      if (draftId) {
        await updateDraft.mutateAsync({ id: draftId, body: p });
      } else {
        const env = await createDraft.mutateAsync(p);
        setDraftId(env.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
      setBanner({ kind: "ok", msg: "Saved as draft" });
    } catch (e) {
      setBanner({ kind: "err", msg: "Save failed: " + (e as Error).message });
    }
  }

  async function handleValidate() {
    try {
      let id = draftId;
      if (!id) {
        const env = await createDraft.mutateAsync(p);
        id = env.id;
        setDraftId(id);
      } else {
        await updateDraft.mutateAsync({ id, body: p });
      }
      const result = await validateDraft.mutateAsync(id);
      setRemoteIssues(result.errors ?? []);
      if (result.ok) {
        set({ state: "validated" });
        setBanner({ kind: "ok", msg: "Validation passed" });
      } else {
        setBanner({
          kind: "warn",
          msg: `Validation: ${result.errors?.length ?? 0} issue(s)`,
        });
      }
    } catch (e) {
      setBanner({ kind: "err", msg: "Validate failed: " + (e as Error).message });
    }
  }

  async function handleStage() {
    try {
      if (isExistingPrimitive) {
        const res = await updatePrim.mutateAsync({ slug: p.slug, body: p });
        setBanner({
          kind: "ok",
          msg: res.warnings?.length
            ? `Updated; ${res.warnings.length} warning(s)`
            : "Updated",
        });
        go?.("browser", { slug: res.ui?.slug ?? p.slug });
      } else {
        let res;
        if (draftId) {
          await updateDraft.mutateAsync({ id: draftId, body: p });
          res = await stageDraft.mutateAsync(draftId);
          setDraftId(null);
        } else {
          res = await createPrim.mutateAsync(p);
        }
        setBanner({
          kind: "ok",
          msg: res.warnings?.length
            ? `Published; ${res.warnings.length} warning(s)`
            : "Published",
        });
        go?.("browser", { slug: res.ui?.slug ?? p.slug });
      }
    } catch (e) {
      setBanner({ kind: "err", msg: "Publish failed: " + (e as Error).message });
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    try {
      if (isExistingPrimitive) {
        await deletePrim.mutateAsync(p.slug);
      } else if (draftId) {
        await deleteDraft.mutateAsync(draftId);
        setDraftId(null);
      }
      onDelete?.();
      go?.("browser");
    } catch (e) {
      setBanner({ kind: "err", msg: "Delete failed: " + (e as Error).message });
    }
  }

  async function handleFork() {
    if (!isExistingPrimitive) {
      // For unsaved drafts/new primitives, fall back to the existing client-side
      // shortcut so the user still gets a fresh editor.
      onFork?.(p.id);
      return;
    }
    try {
      const res = await forkPrim.mutateAsync({ sourceSlug: p.slug });
      const newSlug = (res.ui?.slug as string) ?? `${p.slug}-fork-1`;
      go?.("editor", { slug: newSlug });
      setBanner({ kind: "ok", msg: `Forked → ${newSlug}` });
    } catch (e) {
      setBanner({ kind: "err", msg: "Fork failed: " + (e as Error).message });
    }
  }

  const issues = useMemo<Issue[]>(() => {
    const out: Issue[] = [];
    if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug)) {
      out.push({ sev: "reject", field: "slug", msg: "Slug must be kebab-case." });
    }
    if (!p.name?.trim()) {
      out.push({ sev: "reject", field: "name", msg: "Display name required." });
    }
    if (!p.desc?.trim()) {
      out.push({ sev: "warn", field: "desc", msg: "Description is empty." });
    }
    if (!p.names.en?.canonical?.trim()) {
      out.push({ sev: "reject", field: "i18n.en", msg: "Canonical en name required." });
    }
    if (!p.names.fr?.canonical?.trim()) {
      out.push({
        sev: "warn",
        field: "i18n.fr",
        msg: "Canonical fr name missing — primitive will not appear in fr resolve index.",
      });
    }
    const eAliases = p.names.en?.aliases ?? [];
    eAliases.forEach((a) => {
      const collide = PRIMS.find(
        (x) =>
          x.id !== p.id &&
          (x.names.en?.canonical === a || x.names.en?.aliases?.includes(a)),
      );
      if (collide) {
        out.push({
          sev: "warn",
          field: `alias.en.${a}`,
          msg: `Alias "${a}" resolves to existing primitive "${collide.name}".`,
        });
      }
    });
    // Merge in server-side validation findings from the last Validate run.
    // These are authoritative — they reflect what the spec validator + slug-
    // collision gate emit, which the local heuristics cannot fully reproduce.
    if (remoteIssues) {
      for (const r of remoteIssues) {
        out.push({
          sev: r.sev === "warn" ? "warn" : "reject",
          field: r.field || "server",
          msg: r.message,
        });
      }
    }
    return out;
  }, [p, remoteIssues]);

  const rejectCount = issues.filter((i) => i.sev === "reject").length;
  const warnCount = issues.filter((i) => i.sev === "warn").length;
  const canPublish = rejectCount === 0;

  const set = (patch: Partial<Primitive>) => setP((prev) => ({ ...prev, ...patch }));
  const setLang = (lang: LangKey, patch: Partial<{ canonical: string; aliases: string[] }>) =>
    setP((prev) => ({
      ...prev,
      names: {
        ...prev.names,
        [lang]: {
          canonical: prev.names[lang]?.canonical ?? "",
          aliases: prev.names[lang]?.aliases ?? [],
          ...patch,
        },
      },
    }));

  const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
    { id: "identity", label: "Identity", icon: <I.User size={13} /> },
    { id: "i18n", label: "Localization", icon: <I.Lang size={13} /> },
    { id: "domain", label: "Domain fields", icon: <I.Tag size={13} /> },
    { id: "rel", label: "Relationships", icon: <I.Tree size={13} /> },
    { id: "lineage", label: "Lineage", icon: <I.GitCommit size={13} /> },
    { id: "media", label: "Media", icon: <I.Link size={13} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <KindGlyph kind={p.kind} size={16} />
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              title="Switch primitive (also: ⌘K)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: 0,
                padding: "2px 4px",
                margin: "-2px -4px",
                borderRadius: 4,
                cursor: "pointer",
                color: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontWeight: 600 }}>{p.name || "(untitled)"}</span>
              <StateBadge s={p.state} />
              <I.ChevDown size={12} style={{ color: "var(--ink-3)" }} />
            </button>
            <span className="mono" style={{ color: "var(--ink-4)", fontSize: 12 }}>
              {p.slug}
            </span>
            {go && (
              <Button
                variant="ghost"
                size="sm"
                icon={<I.ChevLeft size={12} />}
                onClick={() => go("browser")}
                title="Back to browse"
              >
                Browse
              </Button>
            )}
          </>
        }
        right={
          <>
            <ReadyChip rejectCount={rejectCount} warnCount={warnCount} />
            <Button
              variant="ghost"
              size="sm"
              icon={<I.Fork size={12} />}
              onClick={handleFork}
              disabled={forkPrim.isPending}
              title="Fork creates a new primitive with predecessor + derived_from relationships pointing at this one."
            >
              {forkPrim.isPending ? "Forking…" : "Fork"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<I.Trash size={12} />}
              onClick={() => setConfirmDelete(true)}
              disabled={deletePrim.isPending}
            >
              Delete
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveDraft}
              disabled={createDraft.isPending || updateDraft.isPending}
            >
              {saved
                ? "Saved"
                : createDraft.isPending || updateDraft.isPending
                  ? "Saving…"
                  : "Save draft"}
            </Button>
            <Button
              variant="default"
              size="sm"
              icon={<I.Check size={12} />}
              onClick={handleValidate}
              disabled={validateDraft.isPending}
            >
              {validateDraft.isPending ? "Validating…" : "Validate"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<I.Upload size={12} />}
              disabled={
                !canPublish ||
                createPrim.isPending ||
                updatePrim.isPending ||
                stageDraft.isPending
              }
              onClick={handleStage}
            >
              {isExistingPrimitive ? "Save changes" : "Stage for publish"}
            </Button>
          </>
        }
      />

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "200px 1fr 280px",
          minHeight: 0,
        }}
      >
        <div
          style={{
            borderRight: "1px solid var(--line)",
            background: "var(--surface)",
            padding: "12px 0",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "0 14px 8px",
              fontSize: 10,
              color: "var(--ink-3)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              fontWeight: 600,
            }}
          >
            Sections
          </div>
          {SECTIONS.map((s) => {
            const issuesHere = issues.filter((i) => {
              if (s.id === "identity") return i.field === "slug" || i.field === "name" || i.field === "desc";
              if (s.id === "i18n") return i.field.startsWith("i18n") || i.field.startsWith("alias");
              return false;
            }).length;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSection(s.id);
                  const el = document.getElementById(`sec-${s.id}`);
                  const scroll = document.getElementById("editor-scroll");
                  if (scroll && el) scroll.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 14px",
                  background: section === s.id ? "var(--surface-2)" : "transparent",
                  border: 0,
                  borderLeft: section === s.id ? "2px solid var(--accent)" : "2px solid transparent",
                  textAlign: "left",
                  fontSize: 12.5,
                  cursor: "pointer",
                  color: section === s.id ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: section === s.id ? 600 : 500,
                }}
              >
                <span style={{ color: "var(--ink-3)" }}>{s.icon}</span>
                <span style={{ flex: 1 }}>{s.label}</span>
                {issuesHere > 0 && (
                  <SeverityDot
                    sev={issues.find((i) => i.sev === "reject") ? "reject" : "warn"}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div id="editor-scroll" style={{ overflowY: "auto", background: "var(--bg)" }}>
          <div style={{ maxWidth: 720, padding: "20px 24px", margin: "0 auto" }}>
            <SectionBlock id="identity" title="Identity" subtitle="Stable handles that other primitives reference">
              <KindSelector kind={p.kind} onChange={(kind) => set({ kind })} locked={!fresh} />
              <Field
                label="Slug"
                hint="Kebab-case identifier. Cannot change after first publish."
                issue={issues.find((i) => i.field === "slug")}
              >
                <Input
                  value={p.slug}
                  onChange={(e) =>
                    set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                  }
                  leadingIcon={<I.Tag size={12} />}
                />
              </Field>
              <Field label="Display name" issue={issues.find((i) => i.field === "name")}>
                <Input value={p.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field
                label="Description"
                hint="Markdown supported."
                issue={issues.find((i) => i.field === "desc")}
              >
                <MarkdownArea value={p.desc} onChange={(v) => set({ desc: v })} />
              </Field>
              <Field label="Tags">
                <TagInput value={p.tags} onChange={(tags) => set({ tags })} />
              </Field>
            </SectionBlock>

            <SectionBlock
              id="i18n"
              title="Localization"
              subtitle="Canonical name + aliases per language. Drives the resolve indexes."
            >
              <Tabs<LangKey>
                value={activeLang}
                onChange={setActiveLang}
                dense
                items={(["en", "de", "fr", "ja"] as LangKey[]).map((l) => {
                  const present = !!p.names[l]?.canonical?.trim();
                  return {
                    value: l,
                    label: ({ en: "English", de: "Deutsch", fr: "Français", ja: "日本語" } as const)[l],
                    badge: present ? null : "+",
                    icon: (
                      <span
                        className="mono"
                        style={{
                          fontSize: 9,
                          color: present ? "var(--accent)" : "var(--ink-4)",
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                        }}
                      >
                        {l}
                      </span>
                    ),
                  };
                })}
              />
              <div style={{ paddingTop: 14 }}>
                <LangPanel
                  lang={activeLang}
                  value={
                    p.names[activeLang] ?? { canonical: "", aliases: [] }
                  }
                  onChange={(patch) => setLang(activeLang, patch)}
                  issues={issues.filter(
                    (i) =>
                      i.field.startsWith(`alias.${activeLang}`) || i.field === `i18n.${activeLang}`,
                  )}
                />
              </div>
            </SectionBlock>

            <SectionBlock
              id="domain"
              title="Domain fields"
              subtitle={`Kind-specific attributes for ${KIND_LABEL[p.kind]}`}
            >
              <DomainFields
                kind={p.kind}
                value={(p.domain as Record<string, string | number | null>) ?? {}}
                onChange={(v) => set({ domain: { ...p.domain, ...v } as Primitive["domain"] })}
              />
            </SectionBlock>

            <SectionBlock
              id="rel"
              title="Relationships"
              subtitle="Edges to other primitives in the graph"
              action={
                <Button
                  variant="default"
                  size="sm"
                  icon={<I.Plus size={12} />}
                  onClick={() => setPicker({ type: "uses_tool" })}
                >
                  Add relationship
                </Button>
              }
            >
              <RelList rels={p.rel} onChange={(rel) => set({ rel })} />
            </SectionBlock>

            <SectionBlock
              id="lineage"
              title="Lineage"
              subtitle="Provenance state and outcome (defaults to floor)"
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Provenance state" hint="Floor is `unasserted` for most commons records.">
                  <SelectInput<ProvenanceState>
                    value={p.provenanceState ?? "unasserted"}
                    options={["unasserted", "asserted", "unknown", "external"]}
                    onChange={(v) => set({ provenanceState: v })}
                  />
                </Field>
                <Field label="Outcome" hint="Floor is `unknown` until a maintainer attests.">
                  <SelectInput<Outcome>
                    value={p.outcome ?? "unknown"}
                    options={["succeeded", "failed", "partial", "aborted", "superseded", "unknown"]}
                    onChange={(v) => set({ outcome: v })}
                  />
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <Field label="Predecessor" hint="Optional. Earlier version of this primitive.">
                  <Input placeholder="None" leadingIcon={<I.GitCommit size={11} />} />
                </Field>
                <Field label="Derived from" hint="Optional. Source primitive (in another commons).">
                  <Input placeholder="None" leadingIcon={<I.Globe size={11} />} />
                </Field>
              </div>
            </SectionBlock>

            <SectionBlock
              id="media"
              title="Media"
              subtitle="URL references only — embedded media is not allowed in the commons"
            >
              <MediaList />
            </SectionBlock>

            <div style={{ height: 60 }} />
          </div>
        </div>

        <div
          style={{
            borderLeft: "1px solid var(--line)",
            background: "var(--surface)",
            padding: 16,
            overflowY: "auto",
          }}
        >
          <Rail label="Content hash">
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--ink-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: 4,
                padding: "6px 8px",
                wordBreak: "break-all",
                lineHeight: 1.55,
              }}
            >
              {p.hash}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <Button variant="ghost" size="sm" icon={<I.Copy size={11} />}>
                Copy
              </Button>
              <Button variant="ghost" size="sm" icon={<I.Refresh size={11} />}>
                Recompute
              </Button>
            </div>
          </Rail>

          <Rail label="Emitter">
            <div className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
              {p.emitter}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
              License:{" "}
              <b className="mono" style={{ color: "var(--ink-2)" }}>
                {p.license}
              </b>
            </div>
          </Rail>

          <Rail label="Validation">
            {issues.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--sev-approve)",
                }}
              >
                <SeverityDot sev="approve" /> All gates pass
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {issues.map((iss, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "20px 1fr",
                      gap: 6,
                      fontSize: 11.5,
                      color: "var(--ink-2)",
                      lineHeight: 1.45,
                    }}
                  >
                    <SeverityDot sev={iss.sev} />
                    <div>
                      <b className="mono" style={{ color: "var(--ink-3)", fontSize: 10 }}>
                        {iss.field}
                      </b>
                      <div>{iss.msg}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Rail>

          <Rail label="Lifecycle">
            <Lifecycle state={p.state} />
          </Rail>
        </div>
      </div>

      <RelPickerModal
        picker={picker}
        onClose={() => setPicker(null)}
        onSubmit={(rel) => {
          set({ rel: [...p.rel, rel] });
          setPicker(null);
        }}
      />

      <DeleteConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        kind="primitive"
        name={p.name}
        slug={p.slug}
        onConfirm={handleDelete}
      />

      {banner && (
        <div
          style={{
            position: "fixed",
            bottom: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 90,
            padding: "10px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background:
              banner.kind === "ok"
                ? "var(--sev-approve-soft, #ddebd6)"
                : banner.kind === "warn"
                  ? "var(--sev-warn-soft, #f3e6c2)"
                  : "var(--sev-reject-soft, #f3d0d0)",
            color:
              banner.kind === "ok"
                ? "var(--sev-approve, #2e5d35)"
                : banner.kind === "warn"
                  ? "var(--sev-warn, #8a5a0a)"
                  : "var(--sev-reject, #802020)",
            border: "1px solid",
            borderColor:
              banner.kind === "ok"
                ? "var(--sev-approve, #2e5d35)"
                : banner.kind === "warn"
                  ? "var(--sev-warn, #8a5a0a)"
                  : "var(--sev-reject, #802020)",
            boxShadow: "0 6px 16px rgba(31,27,23,0.10)",
          }}
        >
          {banner.msg}
        </div>
      )}

      <PrimitiveSwitcherModal
        open={switcherOpen}
        currentSlug={p.slug}
        onClose={() => setSwitcherOpen(false)}
        onPick={(picked) => {
          setSwitcherOpen(false);
          if (go) {
            go("editor", { slug: picked.id });
          }
        }}
      />
    </div>
  );
}

function ReadyChip({ rejectCount, warnCount }: { rejectCount: number; warnCount: number }) {
  if (rejectCount) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--sev-reject)",
          padding: "2px 8px",
          background: "var(--sev-reject-soft)",
          borderRadius: 4,
        }}
      >
        <SeverityDot sev="reject" /> Not ready — {rejectCount} blocking
      </span>
    );
  }
  if (warnCount) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--sev-warn)",
          padding: "2px 8px",
          background: "var(--sev-warn-soft)",
          borderRadius: 4,
        }}
      >
        <SeverityDot sev="warn" /> Mergeable with {warnCount} warning{warnCount > 1 ? "s" : ""}
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--sev-approve)",
        padding: "2px 8px",
        background: "var(--sev-approve-soft)",
        borderRadius: 4,
      }}
    >
      <SeverityDot sev="approve" /> Ready to publish
    </span>
  );
}

function SectionBlock({
  id,
  title,
  subtitle,
  action,
  children,
}: {
  id: SectionId;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div id={`sec-${id}`} style={{ marginBottom: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 10,
          paddingBottom: 6,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  issue,
  children,
}: {
  label: string;
  hint?: string;
  issue?: Issue;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
          fontSize: 11,
          color: "var(--ink-2)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        <span>{label}</span>
        {issue && <SeverityDot sev={issue.sev} />}
      </div>
      {children}
      {hint && !issue && (
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{hint}</div>
      )}
      {issue && (
        <div style={{ fontSize: 11.5, color: SEV[issue.sev].color, marginTop: 4 }}>{issue.msg}</div>
      )}
    </div>
  );
}

function Rail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 10,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function KindSelector({
  kind,
  onChange,
  locked,
}: {
  kind: PrimitiveKind;
  onChange: (k: PrimitiveKind) => void;
  locked?: boolean;
}) {
  const kinds: PrimitiveKind[] = ["tool", "material", "technique", "workflow", "project", "event"];
  return (
    <Field label="Kind" hint={locked ? "Kind is locked after creation." : "Closed set of six."}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {kinds.map((k) => {
          const Ico = KIND_ICON[k];
          const active = k === kind;
          return (
            <button
              key={k}
              onClick={() => !locked && onChange(k)}
              disabled={locked && k !== kind}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 5,
                cursor: locked ? "default" : "pointer",
                border: `1px solid ${active ? "var(--accent)" : "var(--line-2)"}`,
                background: active ? "var(--accent-soft)" : "var(--surface)",
                color: active ? "var(--accent)" : "var(--ink-2)",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                opacity: locked && !active ? 0.4 : 1,
              }}
            >
              <Ico size={13} />
              {KIND_LABEL[k]}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function MarkdownArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [preview, setPreview] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--line-2)",
        borderRadius: 5,
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 6px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface-2)",
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            color: "var(--ink-3)",
            textTransform: "uppercase",
            letterSpacing: 0.6,
            paddingLeft: 4,
          }}
        >
          Markdown
        </div>
        <Segmented<"edit" | "preview">
          value={preview ? "preview" : "edit"}
          onChange={(v) => setPreview(v === "preview")}
          options={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
        />
      </div>
      {preview ? (
        <div style={{ padding: "10px 12px", fontSize: 13, lineHeight: 1.55, minHeight: 84 }}>
          {value || <span style={{ color: "var(--ink-4)" }}>Nothing to preview yet.</span>}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            minHeight: 84,
            padding: "8px 12px",
            background: "transparent",
            border: 0,
            outline: 0,
            resize: "vertical",
            fontFamily: "inherit",
            fontSize: 13,
            color: "var(--ink)",
            lineHeight: 1.55,
          }}
        />
      )}
    </div>
  );
}

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: "5px 6px",
        background: "var(--surface)",
        border: "1px solid var(--line-2)",
        borderRadius: 5,
      }}
    >
      {value.map((t, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "1px 4px 1px 8px",
            borderRadius: 12,
            fontSize: 11.5,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            color: "var(--ink-2)",
          }}
        >
          {t}
          <button
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--ink-3)",
              padding: 0,
              display: "inline-flex",
            }}
          >
            <I.X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            onChange([...value, draft.trim()]);
            setDraft("");
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        placeholder="Add tag…"
        style={{
          flex: 1,
          minWidth: 80,
          background: "transparent",
          border: 0,
          outline: 0,
          fontSize: 13,
          padding: "2px 4px",
        }}
      />
    </div>
  );
}

function LangPanel({
  lang,
  value,
  onChange,
  issues,
}: {
  lang: LangKey;
  value: { canonical: string; aliases: string[] };
  onChange: (patch: Partial<{ canonical: string; aliases: string[] }>) => void;
  issues: Issue[];
}) {
  const canonIssue = issues.find((i) => i.field === `i18n.${lang}`);
  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 600,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>Canonical</span>
        {canonIssue && <SeverityDot sev={canonIssue.sev} />}
      </div>
      <Input
        value={value.canonical}
        onChange={(e) => onChange({ canonical: e.target.value })}
        style={{ fontSize: 14, height: 32 }}
        placeholder={`Canonical ${lang.toUpperCase()} name`}
      />
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 600,
          marginTop: 14,
          marginBottom: 6,
        }}
      >
        Aliases · {value.aliases.length}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {value.aliases.map((a, i) => {
          const issue = issues.find((iss) => iss.field === `alias.${lang}.${a}`);
          return (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Input
                value={a}
                onChange={(e) =>
                  onChange({
                    aliases: value.aliases.map((x, j) => (j === i ? e.target.value : x)),
                  })
                }
                style={{ flex: 1 }}
                error={!!issue}
                trailingIcon={issue ? <SeverityDot sev={issue.sev} /> : null}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={<I.X size={12} />}
                onClick={() =>
                  onChange({ aliases: value.aliases.filter((_, j) => j !== i) })
                }
              />
            </div>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          icon={<I.Plus size={12} />}
          style={{ alignSelf: "flex-start" }}
          onClick={() => onChange({ aliases: [...value.aliases, ""] })}
        >
          Add alias
        </Button>
      </div>
    </div>
  );
}

interface DomainFieldDef {
  id: string;
  label: string;
  options?: string[];
  text?: boolean;
  num?: boolean;
}

const DOMAIN_FIELDS: Record<PrimitiveKind, DomainFieldDef[]> = {
  tool: [
    { id: "category", label: "Category", options: ["cutting", "piercing", "striking", "finishing", "measuring"] },
    { id: "manufacturer", label: "Manufacturer", text: true },
  ],
  material: [
    {
      id: "materialType",
      label: "Material type",
      options: ["leather", "thread", "wax", "dye", "adhesive"],
    },
    { id: "unit", label: "Unit", options: ["sq.ft", "m", "g", "ml", "ea"] },
  ],
  technique: [
    { id: "skillLevel", label: "Skill level", options: ["beginner", "intermediate", "advanced"] },
    { id: "steps", label: "Step count", num: true },
  ],
  workflow: [
    { id: "difficulty", label: "Difficulty", options: ["beginner", "intermediate", "advanced", "expert"] },
    { id: "steps", label: "Total steps", num: true },
  ],
  project: [],
  event: [],
};

function DomainFields({
  kind,
  value,
  onChange,
}: {
  kind: PrimitiveKind;
  value: Record<string, string | number | null>;
  onChange: (v: Record<string, string | number>) => void;
}) {
  const fields = DOMAIN_FIELDS[kind] ?? [];
  if (fields.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
        No domain fields for {KIND_LABEL[kind]}.
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {fields.map((f) => (
        <Field key={f.id} label={f.label}>
          {f.options ? (
            <SelectInput
              value={String(value[f.id] ?? f.options[0])}
              options={f.options}
              onChange={(v) => onChange({ [f.id]: v })}
            />
          ) : (
            <Input
              value={String(value[f.id] ?? "")}
              type={f.num ? "number" : "text"}
              onChange={(e) =>
                onChange({ [f.id]: f.num ? +e.target.value : e.target.value })
              }
            />
          )}
        </Field>
      ))}
    </div>
  );
}

function SelectInput<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange?: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 6px 0 10px",
        background: "var(--surface)",
        border: "1px solid var(--line-2)",
        borderRadius: 5,
        height: 28,
      }}
    >
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value as T)}
        style={{
          flex: 1,
          background: "transparent",
          border: 0,
          outline: 0,
          fontSize: 13,
          color: "var(--ink)",
          appearance: "none",
          paddingRight: 4,
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <I.ChevDown size={12} style={{ color: "var(--ink-3)" }} />
    </div>
  );
}

const REL_LABEL: Record<Relationship["type"], string> = {
  uses_tool: "Uses tool",
  uses_material: "Uses material",
  applies_technique: "Applies technique",
  composed_of: "Composed of",
  specializes: "Specializes",
  predecessor: "Predecessor",
  derived_from: "Derived from",
};

function RelList({
  rels,
  onChange,
}: {
  rels: Relationship[];
  onChange: (r: Relationship[]) => void;
}) {
  const { data: PRIMS = [] } = usePrimitives();
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      {rels.length === 0 ? (
        <div style={{ padding: 18, textAlign: "center", color: "var(--ink-3)", fontSize: 12 }}>
          No relationships yet.
        </div>
      ) : (
        rels.map((r, i) => {
          const t = PRIMS.find((p) => p.id === r.target);
          const Ico = t ? KIND_ICON[t.kind] : I.Link;
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 28px 1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "8px 12px",
                borderTop: i === 0 ? "0" : "1px solid var(--line)",
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--accent)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {REL_LABEL[r.type] ?? r.type}
              </span>
              <Ico size={14} style={{ color: "var(--ink-3)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t?.name ?? r.target}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-3)",
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  {t && (
                    <span style={{ color: "var(--ink-3)", fontSize: 11 }}>
                      {KIND_LABEL[t.kind]}
                    </span>
                  )}
                  {t && <Hash value={t.hash} mute />}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<I.X size={12} />}
                onClick={() => onChange(rels.filter((_, j) => j !== i))}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

function PrimitiveSwitcherModal({
  open,
  currentSlug,
  onClose,
  onPick,
}: {
  open: boolean;
  currentSlug: string;
  onClose: () => void;
  onPick: (p: Primitive) => void;
}) {
  const { data: PRIMS = [] } = usePrimitives();
  const [q, setQ] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setQ("");
      setFocusIdx(0);
    }
  }, [open]);

  const filtered = PRIMS.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.slug.includes(q.toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const p = filtered[focusIdx];
        if (p) onPick(p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, focusIdx, onPick]);

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Switch primitive" width={520}>
      <Input
        leadingIcon={<I.Search size={12} />}
        placeholder="Search by name or slug…"
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setFocusIdx(0);
        }}
      />
      <div
        style={{
          marginTop: 10,
          maxHeight: 320,
          overflowY: "auto",
          border: "1px solid var(--line)",
          borderRadius: 5,
          background: "var(--surface)",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 18, textAlign: "center", color: "var(--ink-3)", fontSize: 12 }}>
            No primitives match.
          </div>
        ) : (
          filtered.map((p, i) => {
            const isCurrent = p.slug === currentSlug;
            const isFocused = i === focusIdx;
            const Ico = KIND_ICON[p.kind] ?? I.File;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                onMouseEnter={() => setFocusIdx(i)}
                style={{
                  display: "grid",
                  width: "100%",
                  gridTemplateColumns: "20px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderTop: i === 0 ? 0 : "1px solid var(--line)",
                  background: isFocused ? "var(--surface-2)" : "transparent",
                  border: 0,
                  borderLeft: isFocused ? "2px solid var(--accent)" : "2px solid transparent",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Ico size={14} style={{ color: "var(--ink-3)" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {p.slug}
                  </div>
                </div>
                {isCurrent ? (
                  <span
                    className="mono"
                    style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      background: "var(--surface-2)",
                      color: "var(--ink-3)",
                      borderRadius: 3,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                    }}
                  >
                    Current
                  </span>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>
                    <I.ChevRight size={12} />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)" }}>
        Use ↑ / ↓ to navigate, Enter to switch.
      </div>
    </Modal>
  );
}

function RelPickerModal({
  picker,
  onClose,
  onSubmit,
}: {
  picker: { type: Relationship["type"] } | null;
  onClose: () => void;
  onSubmit: (r: Relationship) => void;
}) {
  const [type, setType] = useState<Relationship["type"]>("uses_tool");
  const [target, setTarget] = useState<Primitive | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (picker) {
      setType(picker.type);
      setTarget(null);
      setQ("");
    }
  }, [picker]);
  const { data: PRIMS = [] } = usePrimitives();
  if (!picker) return null;
  const filtered = PRIMS.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.slug.includes(q.toLowerCase()),
  ).slice(0, 8);
  return (
    <Modal
      open
      onClose={onClose}
      title="Add relationship"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!target}
            onClick={() => target && onSubmit({ type, target: target.id })}
          >
            Add
          </Button>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--ink-2)",
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 4,
          }}
        >
          Relationship type
        </div>
        <Segmented<Relationship["type"]>
          value={type}
          onChange={setType}
          options={[
            { value: "uses_tool", label: "uses_tool" },
            { value: "uses_material", label: "uses_material" },
            { value: "applies_technique", label: "applies_technique" },
          ]}
        />
        <div style={{ marginTop: 6 }}>
          <Segmented<Relationship["type"]>
            value={type}
            onChange={setType}
            options={[
              { value: "composed_of", label: "composed_of" },
              { value: "specializes", label: "specializes" },
              { value: "predecessor", label: "predecessor" },
            ]}
          />
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--ink-2)",
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 4,
          }}
        >
          Target primitive
        </div>
        <Input
          leadingIcon={<I.Search size={13} />}
          placeholder="Search by name or slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 5,
          maxHeight: 280,
          overflowY: "auto",
        }}
      >
        {filtered.map((p) => {
          const Ico = KIND_ICON[p.kind];
          const active = target?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => setTarget(p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                cursor: "pointer",
                borderTop: "1px solid var(--line)",
                background: active ? "var(--accent-soft)" : "transparent",
              }}
            >
              <Ico size={14} style={{ color: active ? "var(--accent)" : "var(--ink-3)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {p.slug}
                </div>
              </div>
              {active && <I.Check size={14} style={{ color: "var(--accent)" }} />}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--ink-3)", fontSize: 12 }}>
            No matches.
          </div>
        )}
      </div>
    </Modal>
  );
}

function MediaList() {
  const [urls, setUrls] = useState<{ url: string; kind: string }[]>([
    { url: "https://wiki.leathercraft.community/scratch-awl", kind: "wiki" },
  ]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {urls.map((m, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 100px 32px",
            gap: 8,
            alignItems: "center",
            padding: "6px 8px",
            border: "1px solid var(--line)",
            borderRadius: 5,
            background: "var(--surface)",
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 12,
              color: "var(--ink-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.url}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.kind}</span>
          <Button
            variant="ghost"
            size="sm"
            icon={<I.X size={12} />}
            onClick={() => setUrls(urls.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        icon={<I.Plus size={12} />}
        style={{ alignSelf: "flex-start" }}
        onClick={() => setUrls([...urls, { url: "https://", kind: "reference" }])}
      >
        Add URL reference
      </Button>
    </div>
  );
}

const LIFECYCLE: { id: "draft" | "validated" | "staged" | "published"; label: string; color: string }[] =
  [
    { id: "draft", label: "DRAFT", color: "var(--st-draft)" },
    { id: "validated", label: "VALIDATED", color: "var(--st-validated)" },
    { id: "staged", label: "STAGED", color: "var(--st-staged)" },
    { id: "published", label: "PUBLISHED", color: "var(--st-published)" },
  ];

function Lifecycle({ state }: { state: Primitive["state"] }) {
  const idx = LIFECYCLE.findIndex((s) => s.id === state);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {LIFECYCLE.map((s, i) => {
        const past = i < idx;
        const current = i === idx;
        return (
          <div
            key={s.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              paddingBottom: i === LIFECYCLE.length - 1 ? 0 : 8,
              position: "relative",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: past || current ? s.color : "var(--surface-2)",
                  border: `2px solid ${past || current ? s.color : "var(--line)"}`,
                  flex: "none",
                }}
              />
              {i < LIFECYCLE.length - 1 && (
                <div
                  style={{
                    width: 2,
                    height: 16,
                    background: past ? s.color : "var(--line)",
                    marginTop: 2,
                  }}
                />
              )}
            </div>
            <div style={{ paddingTop: 0 }}>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  color: current ? s.color : past ? "var(--ink-2)" : "var(--ink-4)",
                }}
              >
                {s.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
