import { useState, type ReactNode } from "react";
import {
  Button,
  Card,
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
  Toolbar,
} from "@/components";
import { usePrimitives } from "@/api/hooks";
import type { PaneArgs } from "@/shell/pane-switch";
import type { PaneId } from "@/nav";
import type { Primitive, PrimitiveKind } from "@/types/primitives";

interface PaneProps {
  go: (id: PaneId, args?: PaneArgs) => void;
}

const ALL_KINDS: PrimitiveKind[] = [
  "tool",
  "material",
  "technique",
  "workflow",
  "project",
  "event",
];

type ViewMode = "grid" | "list";
type LangKey = "en" | "de" | "fr";

export function PaneBrowser({ go }: PaneProps) {
  const [view, setView] = useState<ViewMode>("grid");
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<Set<PrimitiveKind>>(
    new Set(["tool", "material", "technique", "workflow"]),
  );
  const [lang, setLang] = useState<LangKey>("en");
  const { data: prims = [] } = usePrimitives();

  const filtered = prims.filter(
    (p) =>
      kinds.has(p.kind) &&
      (!q ||
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.slug.includes(q.toLowerCase())),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Search size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Browse</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · {filtered.length} of {prims.length} primitives
            </span>
          </>
        }
        right={
          <>
            <Input
              leadingIcon={<I.Search size={12} />}
              placeholder="Search primitives…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 280 }}
            />
            <Segmented<LangKey>
              value={lang}
              onChange={setLang}
              options={["en", "de", "fr"] as LangKey[]}
            />
            <Segmented<ViewMode>
              value={view}
              onChange={setView}
              options={[
                { value: "grid", icon: <I.Grid size={12} />, label: "Grid" },
                { value: "list", icon: <I.List size={12} />, label: "List" },
              ]}
            />
            <Button
              variant="primary"
              size="sm"
              icon={<I.Plus size={12} />}
              onClick={() => go("editor", { fresh: true })}
            >
              New
            </Button>
          </>
        }
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 0 }}>
        <div
          style={{
            borderRight: "1px solid var(--line)",
            background: "var(--surface)",
            padding: "16px 14px",
            overflowY: "auto",
          }}
        >
          <FilterGroup label="Kind">
            {ALL_KINDS.map((k) => {
              const Ico = KIND_ICON[k];
              return (
                <FilterCheck
                  key={k}
                  checked={kinds.has(k)}
                  onChange={(v) => {
                    const n = new Set(kinds);
                    if (v) n.add(k);
                    else n.delete(k);
                    setKinds(n);
                  }}
                  icon={<Ico size={13} />}
                  label={KIND_LABEL[k] ?? k}
                  count={prims.filter((p) => p.kind === k).length}
                />
              );
            })}
          </FilterGroup>
          <FilterGroup label="Root">
            <FilterCheck
              checked
              icon={<I.Globe size={13} style={{ color: "var(--accent)" }} />}
              label="Rillmark (primary)"
              count={184}
            />
            <FilterCheck icon={<I.Globe size={13} />} label="Leatherworker DE" count={47} />
            <FilterCheck icon={<I.Globe size={13} />} label="Bindery Commons" count={122} />
          </FilterGroup>
          <FilterGroup label="Tags">
            {["essential", "cutting", "piercing", "stitching", "finishing", "beltmaking"].map(
              (t) => (
                <FilterCheck key={t} icon={<I.Tag size={13} />} label={t} />
              ),
            )}
          </FilterGroup>
        </div>

        <div style={{ overflowY: "auto", padding: 16 }}>
          {view === "grid" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {filtered.map((p) => (
                <PrimCard
                  key={p.id}
                  p={p}
                  lang={lang}
                  onClick={() => go("editor", { slug: p.id })}
                />
              ))}
            </div>
          ) : (
            <Card padded={false}>
              {filtered.map((p, i) => (
                <PrimRow
                  key={p.id}
                  p={p}
                  first={i === 0}
                  lang={lang}
                  onClick={() => go("editor", { slug: p.id })}
                />
              ))}
            </Card>
          )}
          {filtered.length === 0 && (
            <Empty
              icon={<I.Search size={20} />}
              title="No primitives match"
              body="Try clearing filters or changing the search query."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
    </div>
  );
}

function FilterCheck({
  checked,
  onChange,
  icon,
  label,
  count,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 4px",
        fontSize: 12.5,
        cursor: "pointer",
        borderRadius: 4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span style={{ color: "var(--ink-3)" }}>{icon}</span>
      <span style={{ flex: 1, color: "var(--ink-2)" }}>{label}</span>
      {count != null && (
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
          {count}
        </span>
      )}
    </label>
  );
}

function PrimCard({
  p,
  lang,
  onClick,
}: {
  p: Primitive;
  lang: LangKey;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: 12,
        cursor: "pointer",
        transition: "border-color 120ms, box-shadow 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--line-2)";
        e.currentTarget.style.boxShadow = "var(--shadow-1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <KindGlyph kind={p.kind} size={14} />
        <StateBadge s={p.state} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.names[lang]?.canonical || p.name}</div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
        {p.slug}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--ink-2)",
          marginTop: 8,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          lineHeight: 1.4,
        }}
      >
        {p.desc}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
        }}
      >
        <Hash value={p.hash} />
        <div style={{ display: "flex", gap: 3 }}>
          {(["en", "de", "fr"] as LangKey[]).map((l) => (
            <LangBadge key={l} lang={l} present={!!p.names[l]?.canonical} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PrimRow({
  p,
  lang,
  onClick,
  first,
}: {
  p: Primitive;
  lang: LangKey;
  onClick: () => void;
  first: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1.4fr 2fr 200px 90px 80px",
        gap: 12,
        alignItems: "center",
        padding: "8px 12px",
        borderTop: first ? "0" : "1px solid var(--line)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <KindGlyph kind={p.kind} size={14} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {p.names[lang]?.canonical || p.name}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {p.slug}
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
        {p.desc}
      </div>
      <Hash value={p.hash} />
      <div style={{ display: "flex", gap: 3 }}>
        {(["en", "de", "fr"] as LangKey[]).map((l) => (
          <LangBadge key={l} lang={l} present={!!p.names[l]?.canonical} />
        ))}
      </div>
      <StateBadge s={p.state} />
    </div>
  );
}
