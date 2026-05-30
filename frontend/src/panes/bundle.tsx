import { useState } from "react";
import {
  Button,
  Card,
  DeleteConfirmModal,
  Empty,
  Hash,
  I,
  Input,
  KIND_ICON,
  KIND_LABEL,
  KindGlyph,
  LangBadge,
  Segmented,
  StateBadge,
  Tabs,
  Toolbar,
} from "@/components";
import { PASCAL_EMITTER_URI } from "@/fixtures";
import { useBundles, usePrimitives } from "@/api/hooks";
import type { Bundle, BundleItem, BundleRole, BundleSuccessor, Primitive, PrimitiveKind } from "@/types/primitives";

type Route =
  | { mode: "list" }
  | { mode: "new" }
  | { mode: "edit"; id: string };

type LangKey = "en" | "de" | "fr";

export function PaneBundle() {
  const [route, setRoute] = useState<Route>({ mode: "list" });
  const [extra, setExtra] = useState<Bundle[]>([]);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const { data: INITIAL_BUNDLES = [] } = useBundles();

  const all = [...INITIAL_BUNDLES, ...extra].filter((b) => !deleted.has(b.id));

  if (route.mode === "list") {
    return (
      <BundleList
        bundles={all}
        onNew={() => setRoute({ mode: "new" })}
        onOpen={(id) => setRoute({ mode: "edit", id })}
      />
    );
  }

  if (route.mode === "new") {
    const fresh: Bundle = {
      id: `untitled-bundle-${Date.now().toString(36)}`,
      slug: "untitled-bundle",
      hash: "sha256:" + "0".repeat(63) + "1",
      emitter: PASCAL_EMITTER_URI,
      license: "CC-BY-4.0",
      state: "draft",
      lifecycle: "open",
      names: {
        en: { name: "Untitled bundle", desc: "" },
        de: { name: "", desc: "" },
        fr: { name: "", desc: "" },
      },
      items: [],
      successors: [],
    };
    return (
      <BundleEditor
        bundle={fresh}
        isNew
        onBack={() => setRoute({ mode: "list" })}
        onCreate={(b) => {
          setExtra((prev) => [...prev, b]);
          setRoute({ mode: "edit", id: b.id });
        }}
        onDelete={() => setRoute({ mode: "list" })}
      />
    );
  }

  const b = all.find((x) => x.id === route.id);
  if (!b) {
    return (
      <BundleList
        bundles={all}
        onNew={() => setRoute({ mode: "new" })}
        onOpen={(id) => setRoute({ mode: "edit", id })}
      />
    );
  }

  return (
    <BundleEditor
      bundle={b}
      onBack={() => setRoute({ mode: "list" })}
      onDelete={() => {
        setDeleted((s) => new Set([...s, b.id]));
        setRoute({ mode: "list" });
      }}
    />
  );
}

function BundleList({
  bundles,
  onNew,
  onOpen,
}: {
  bundles: Bundle[];
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = bundles.filter(
    (b) =>
      !q ||
      b.names.en?.name.toLowerCase().includes(q.toLowerCase()) ||
      b.slug.includes(q.toLowerCase()),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Bundle size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Bundles</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · {filtered.length} of {bundles.length} curatorial groupings
            </span>
          </>
        }
        right={
          <>
            <Input
              leadingIcon={<I.Search size={12} />}
              placeholder="Search bundles…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 240 }}
            />
            <Button variant="primary" size="sm" icon={<I.Plus size={12} />} onClick={onNew}>
              New bundle
            </Button>
          </>
        }
      />
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {filtered.length === 0 ? (
          <Empty
            icon={<I.Bundle size={20} />}
            title="No bundles yet"
            body="Bundles are pinned, curatorial sets of primitives — like “Saddle Stitch Essentials”."
            action={
              <Button variant="primary" icon={<I.Plus size={12} />} onClick={onNew}>
                Author a bundle
              </Button>
            }
          />
        ) : (
          <Card padded={false} style={{ maxWidth: 980, margin: "0 auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1.4fr 2fr 70px 200px 110px 100px",
                gap: 10,
                padding: "6px 14px",
                borderBottom: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 10.5,
                color: "var(--ink-3)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                fontWeight: 600,
              }}
            >
              <span></span>
              <span>Bundle</span>
              <span>Description</span>
              <span>Items</span>
              <span>Hash</span>
              <span>Langs</span>
              <span>State</span>
            </div>
            {filtered.map((b, i) => (
              <BundleRow
                key={b.id}
                b={b}
                first={i === 0}
                onClick={() => onOpen(b.id)}
              />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

function BundleRow({ b, first, onClick }: { b: Bundle; first: boolean; onClick: () => void }) {
  const langs = Object.keys(b.names).filter((l) => b.names[l]?.name?.trim());
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1.4fr 2fr 70px 200px 110px 100px",
        gap: 10,
        alignItems: "center",
        padding: "10px 14px",
        borderTop: first ? "0" : "1px solid var(--line)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <KindGlyph kind="bundle" size={14} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{b.names.en?.name || "(untitled)"}</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {b.slug}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--ink-2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {b.names.en?.desc || <span style={{ color: "var(--ink-4)" }}>—</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <I.Bundle size={11} style={{ color: "var(--ink-4)" }} />
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          {b.items.length}
        </span>
      </div>
      <Hash value={b.hash} />
      <div style={{ display: "flex", gap: 3 }}>
        {(["en", "de", "fr"] as LangKey[]).map((l) => (
          <LangBadge key={l} lang={l} present={langs.includes(l)} />
        ))}
      </div>
      <StateBadge s={b.state} />
    </div>
  );
}

function BundleEditor({
  bundle,
  isNew,
  onBack,
  onCreate,
  onDelete,
}: {
  bundle: Bundle;
  isNew?: boolean;
  onBack: () => void;
  onCreate?: (b: Bundle) => void;
  onDelete?: () => void;
}) {
  const [b, setB] = useState<Bundle>(bundle);
  const [activeLang, setActiveLang] = useState<LangKey>("en");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data: PRIMS = [] } = usePrimitives();
  const { data: INITIAL_BUNDLES = [] } = useBundles();

  const setName = (lang: LangKey, patch: Partial<{ name: string; desc: string }>) =>
    setB((prev) => ({
      ...prev,
      names: { ...prev.names, [lang]: { ...prev.names[lang], ...patch } },
    }));
  const setItems = (items: BundleItem[]) => setB((prev) => ({ ...prev, items }));
  const setSuccessor = (i: number, patch: Partial<BundleSuccessor>) =>
    setB((prev) => ({
      ...prev,
      successors: (prev.successors ?? []).map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));

  const slugValid = /^[a-z0-9-]+$/.test(b.slug);
  const hasEn = !!b.names.en?.name?.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <Button variant="ghost" size="sm" onClick={onBack} icon={<I.ChevLeft size={12} />}>
              Bundles
            </Button>
            <span style={{ color: "var(--ink-4)" }}>/</span>
            <KindGlyph kind="bundle" size={16} />
            <span style={{ fontWeight: 600 }}>{b.names.en?.name || "(untitled)"}</span>
            <span className="mono" style={{ color: "var(--ink-4)", fontSize: 12 }}>
              {b.slug}
            </span>
            <StateBadge s={b.state} />
          </>
        }
        right={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSaved(true);
                setTimeout(() => setSaved(false), 1400);
                if (isNew) onCreate?.(b);
              }}
            >
              {saved ? "Saved" : isNew ? "Create draft" : "Save draft"}
            </Button>
            <Button
              variant="default"
              size="sm"
              icon={<I.Check size={12} />}
              disabled={!slugValid || !hasEn}
            >
              Validate
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<I.Upload size={12} />}
              disabled={!slugValid || !hasEn}
            >
              Stage
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<I.Trash size={12} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </>
        }
      />
      <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
          <Card title="Identity" padded>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <FieldBlock label="Slug" hint="Kebab-case identifier.">
                <Input
                  leadingIcon={<I.Tag size={12} />}
                  value={b.slug}
                  error={!slugValid}
                  onChange={(e) =>
                    setB({
                      ...b,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock label="Lifecycle" hint={b.lifecycle === "closed" ? "Frozen citation — body immutable." : "Living kit — editable."}>
                <Segmented<"open" | "closed">
                  value={b.lifecycle ?? "open"}
                  onChange={(lifecycle) => setB((prev) => ({ ...prev, lifecycle }))}
                  options={[
                    { value: "open", label: "open" },
                    { value: "closed", label: "closed" },
                  ]}
                />
              </FieldBlock>
              <FieldBlock label="License">
                <Input value={b.license} readOnly />
              </FieldBlock>
            </div>
          </Card>

          <div style={{ marginTop: 16 }}>
            <Card title="Localization" padded>
              <Tabs<LangKey>
                value={activeLang}
                onChange={setActiveLang}
                dense
                items={(["en", "de", "fr"] as LangKey[]).map((l) => ({
                  value: l,
                  label: ({ en: "English", de: "Deutsch", fr: "Français" } as const)[l],
                  icon: (
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: b.names[l]?.name?.trim() ? "var(--accent)" : "var(--ink-4)",
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      {l}
                    </span>
                  ),
                  badge: b.names[l]?.name?.trim() ? null : "+",
                }))}
              />
              <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <Input
                  value={b.names[activeLang]?.name ?? ""}
                  onChange={(e) => setName(activeLang, { name: e.target.value })}
                  placeholder={`Bundle name (${activeLang})`}
                  style={{ fontSize: 14, height: 32 }}
                />
                <textarea
                  value={b.names[activeLang]?.desc ?? ""}
                  onChange={(e) => setName(activeLang, { desc: e.target.value })}
                  placeholder={`Bundle description (${activeLang}) — markdown supported`}
                  style={{
                    width: "100%",
                    minHeight: 56,
                    padding: 8,
                    background: "var(--surface)",
                    border: "1px solid var(--line-2)",
                    borderRadius: 5,
                    outline: 0,
                    fontFamily: "inherit",
                    fontSize: 13,
                    color: "var(--ink)",
                    resize: "vertical",
                  }}
                />
              </div>
            </Card>
          </div>

          <div style={{ marginTop: 16 }}>
            <Card
              title={`Items · ${b.items.length}`}
              subtitle="Drag to reorder. Bundles can nest bundles."
              padded={false}
              action={
                <Button variant="default" size="sm" icon={<I.Plus size={12} />}>
                  Add primitive
                </Button>
              }
            >
              {b.items.length === 0 ? (
                <div
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: "var(--ink-3)",
                    fontSize: 12,
                  }}
                >
                  No items yet. Add primitives or other bundles to define the kit.
                </div>
              ) : (
                b.items.map((it, i) => {
                  const isBundle = it.kind === "bundle";
                  const target = isBundle
                    ? INITIAL_BUNDLES.find((x: Bundle) => x.slug === it.slug)
                    : PRIMS.find((p: Primitive) => p.slug === it.slug);
                  const Ico = isBundle
                    ? I.Bundle
                    : KIND_ICON[it.kind as PrimitiveKind];
                  const displayName = isBundle
                    ? (target as Bundle | undefined)?.names?.en?.name ?? it.slug
                    : (target as { name?: string } | undefined)?.name ?? it.slug;
                  return (
                    <div
                      key={i}
                      style={{
                        borderTop: i === 0 ? "0" : "1px solid var(--line)",
                        background: isBundle ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "16px 28px 1fr 160px 32px",
                          gap: 10,
                          alignItems: "center",
                          padding: "8px 12px",
                        }}
                      >
                      <span style={{ color: "var(--ink-4)", cursor: "grab" }}>
                        <I.Drag size={12} />
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          background: isBundle ? "var(--accent-soft)" : "transparent",
                          color: isBundle ? "var(--accent)" : "var(--ink-3)",
                          border: isBundle ? "1px solid rgba(138,74,42,0.2)" : "none",
                        }}
                      >
                        <Ico size={14} />
                      </span>
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {displayName}
                          {isBundle && (
                            <span
                              className="mono"
                              style={{
                                fontSize: 10,
                                padding: "1px 5px",
                                borderRadius: 3,
                                background: "var(--accent)",
                                color: "#fff",
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                textTransform: "uppercase",
                              }}
                            >
                              bundle
                            </span>
                          )}
                        </div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          {isBundle ? "Bundle" : KIND_LABEL[it.kind] ?? it.kind} · {it.slug}
                          {isBundle && (target as Bundle | undefined)?.items && (
                            <span> · {(target as Bundle).items.length} items</span>
                          )}
                        </div>
                      </div>
                      <Segmented<BundleRole>
                        value={it.role}
                        onChange={(role) =>
                          setItems(b.items.map((x, j) => (j === i ? { ...x, role } : x)))
                        }
                        options={[
                          { value: "required", label: "req" },
                          { value: "recommended", label: "rec" },
                          { value: "optional", label: "opt" },
                        ]}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<I.X size={12} />}
                        onClick={() => setItems(b.items.filter((_, j) => j !== i))}
                      />
                      </div>
                      <div style={{ padding: "0 12px 8px 54px" }}>
                        <Input
                          value={it.note?.[activeLang] ?? ""}
                          onChange={(e) =>
                            setItems(
                              b.items.map((x, j) =>
                                j === i
                                  ? { ...x, note: { ...(x.note ?? {}), [activeLang]: e.target.value } }
                                  : x,
                              ),
                            )
                          }
                          placeholder={`note (${activeLang}) — optional, shown to importers`}
                          style={{ height: 28, fontSize: 12 }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
          </div>

          <div style={{ marginTop: 16 }}>
            <Card
              title={`Successors · ${(b.successors ?? []).length}`}
              subtitle="Append-only forward pointers to newer standalone bundles. Excluded from the bundle hash; the original stays available."
              padded={false}
              action={
                <Button
                  variant="default"
                  size="sm"
                  icon={<I.Plus size={12} />}
                  onClick={() =>
                    setB((prev) => ({
                      ...prev,
                      successors: [
                        ...(prev.successors ?? []),
                        { target: "", note: {}, change_impact: "", added: new Date().toISOString().slice(0, 10) },
                      ],
                    }))
                  }
                >
                  Add successor
                </Button>
              }
            >
              {(b.successors ?? []).length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", color: "var(--ink-3)", fontSize: 12 }}>
                  No successors. Add one when a newer bundle supersedes this one.
                </div>
              ) : (
                (b.successors ?? []).map((sc, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "8px 12px",
                      borderTop: i === 0 ? "0" : "1px solid var(--line)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 170px 32px", gap: 8, alignItems: "center" }}>
                      <Input
                        leadingIcon={<I.Tag size={12} />}
                        value={sc.target}
                        placeholder="successor bundle slug or hash"
                        onChange={(e) => setSuccessor(i, { target: e.target.value })}
                      />
                      <Input
                        value={sc.change_impact ?? ""}
                        placeholder="change_impact (optional)"
                        onChange={(e) => setSuccessor(i, { change_impact: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<I.X size={12} />}
                        onClick={() =>
                          setB((prev) => ({
                            ...prev,
                            successors: (prev.successors ?? []).filter((_, j) => j !== i),
                          }))
                        }
                      />
                    </div>
                    <Input
                      value={sc.note?.[activeLang] ?? ""}
                      placeholder={`why supersede (${activeLang}) — optional`}
                      style={{ height: 28, fontSize: 12 }}
                      onChange={(e) =>
                        setSuccessor(i, { note: { ...(sc.note ?? {}), [activeLang]: e.target.value } })
                      }
                    />
                  </div>
                ))
              )}
            </Card>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: "8px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 5,
              fontSize: 11,
              color: "var(--ink-3)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <div>
              Bundle hash: <Hash value={b.hash} />
            </div>
            <div>
              Emitter:{" "}
              <span className="mono" style={{ color: "var(--accent)" }}>
                {b.emitter}
              </span>
            </div>
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        kind="bundle"
        name={b.names.en?.name ?? b.slug}
        slug={b.slug}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete?.();
        }}
      />
    </div>
  );
}

function FieldBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-2)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}
