import { useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Hash,
  I,
  KIND_ICON,
  KIND_LABEL,
  Segmented,
  SeverityChip,
  SeverityDot,
  Tabs,
  Toolbar,
} from "@/components";
import { usePrimitives, useRegenerateIndexes } from "@/api/hooks";
import type { Primitive, PrimitiveKind } from "@/types/primitives";

type LangKey = "en" | "de" | "fr";
type IndexTab = "resolve" | "taxonomy";
type TaxView = "tree" | "json";

interface TaxTree {
  [slug: string]: TaxTree;
}

const TAX_KINDS: PrimitiveKind[] = ["tool", "material", "technique", "workflow"];

export function PaneIndex() {
  const [tab, setTab] = useState<IndexTab>("resolve");
  const [lang, setLang] = useState<LangKey>("en");
  const [taxView, setTaxView] = useState<TaxView>("tree");
  const { data: PRIMS = [] } = usePrimitives();
  const regen = useRegenerateIndexes();

  const rows = useMemo(() => {
    const out: {
      key: string;
      kind: PrimitiveKind;
      slug: string;
      hash: string;
      canon: boolean;
    }[] = [];
    PRIMS.forEach((p) => {
      const e = p.names[lang];
      if (!e) return;
      if (e.canonical) {
        out.push({ key: e.canonical, kind: p.kind, slug: p.id, hash: p.hash, canon: true });
      }
      e.aliases.forEach((a) => {
        out.push({ key: a, kind: p.kind, slug: p.id, hash: p.hash, canon: false });
      });
    });
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }, [lang, PRIMS]);

  const taxTree = useMemo<Record<string, TaxTree>>(() => {
    const t: Record<string, TaxTree> = {};
    const byParent: Record<string, Primitive[]> = {};
    PRIMS.forEach((p) => {
      const parent = p.specializes ?? "__root__";
      (byParent[parent] = byParent[parent] ?? []).push(p);
    });
    function build(slug: string): TaxTree {
      const node: TaxTree = {};
      (byParent[slug] ?? []).forEach((c) => {
        node[c.id] = build(c.id);
      });
      return node;
    }
    TAX_KINDS.forEach((k) => {
      const roots = (byParent.__root__ ?? []).filter((p) => p.kind === k);
      const node: TaxTree = {};
      roots.forEach((r) => {
        node[r.id] = build(r.id);
      });
      t[k] = node;
    });
    return t;
  }, [PRIMS]);

  const entryCount = (function count(o: TaxTree): number {
    let n = 0;
    for (const k in o) {
      n += 1 + count(o[k]);
    }
    return n;
  })(taxTree as TaxTree);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Index size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Index Inspector</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · read-only · auto-generated
            </span>
          </>
        }
        right={
          <>
            <SeverityChip sev="approve" />{" "}
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>matches committed</span>
            <Button
              variant="default"
              size="sm"
              icon={<I.Refresh size={12} />}
              onClick={() => regen.mutate()}
              disabled={regen.isPending}
            >
              {regen.isPending ? "Regenerating…" : "Regenerate"}
            </Button>
          </>
        }
      />
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <Tabs<IndexTab>
          value={tab}
          onChange={setTab}
          items={[
            { value: "resolve", label: "Resolve indexes", icon: <I.Search size={13} /> },
            { value: "taxonomy", label: "Taxonomy indexes", icon: <I.Tree size={13} /> },
          ]}
        />
      </div>
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Language</span>
        <Segmented<LangKey> value={lang} onChange={setLang} options={["en", "de", "fr"] as LangKey[]} />
        <span style={{ flex: 1 }} />
        {tab === "taxonomy" && (
          <Segmented<TaxView>
            value={taxView}
            onChange={setTaxView}
            options={[
              { value: "tree", label: "Tree", icon: <I.Tree size={11} /> },
              { value: "json", label: "JSON", icon: <I.File size={11} /> },
            ]}
          />
        )}
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {tab === "resolve" ? `${rows.length} entries` : `${entryCount} nodes`}
        </span>
      </div>

      {tab === "resolve" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr
                style={{
                  position: "sticky",
                  top: 0,
                  background: "var(--surface-2)",
                  textAlign: "left",
                }}
              >
                <Th>Key</Th>
                <Th>Kind</Th>
                <Th>Slug</Th>
                <Th>Hash</Th>
                <Th>Canonical</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                  <Td>
                    <span
                      className={r.canon ? "" : "mono"}
                      style={{ color: r.canon ? "var(--ink)" : "var(--ink-2)" }}
                    >
                      {r.key}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: "var(--ink-3)", fontSize: 11 }}>
                      {KIND_LABEL[r.kind]}
                    </span>
                  </Td>
                  <Td>
                    <span className="mono">{r.slug}</span>
                  </Td>
                  <Td>
                    <Hash value={r.hash} />
                  </Td>
                  <Td>
                    {r.canon ? (
                      <I.Check size={12} style={{ color: "var(--sev-approve)" }} />
                    ) : (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "taxonomy" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {taxView === "tree" ? (
            <Card padded={false} style={{ maxWidth: 820, margin: "0 auto" }}>
              <div style={{ padding: "10px 4px" }}>
                {Object.entries(taxTree).map(([kind, roots]) => (
                  <TaxKindBlock key={kind} kind={kind as PrimitiveKind} roots={roots} />
                ))}
              </div>
            </Card>
          ) : (
            <Card padded={false} style={{ maxWidth: 820, margin: "0 auto" }}>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  fontSize: 11.5,
                  lineHeight: 1.55,
                  color: "var(--ink-2)",
                  overflowX: "auto",
                  whiteSpace: "pre",
                  background: "var(--surface)",
                  borderRadius: 6,
                }}
              >
                {JSON.stringify(taxTree, null, 2)}
              </pre>
            </Card>
          )}
          <div
            style={{
              maxWidth: 820,
              margin: "10px auto 0",
              padding: "0 4px",
              fontSize: 11.5,
              color: "var(--ink-3)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <SeverityDot sev="approve" /> Read-only view. Locally regenerated tree matches the
            committed <span className="mono">indexes/taxonomy/{lang}.json</span>.
          </div>
        </div>
      )}
    </div>
  );
}

function TaxKindBlock({ kind, roots }: { kind: PrimitiveKind; roots: TaxTree }) {
  const Ico = KIND_ICON[kind];
  const rootKeys = Object.keys(roots);
  if (rootKeys.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface-2)",
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 600,
        }}
      >
        <Ico size={12} /> {KIND_LABEL[kind]} ·{" "}
        <span className="mono" style={{ textTransform: "none" }}>
          {rootKeys.length} root{rootKeys.length > 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ padding: "6px 8px" }}>
        {rootKeys.map((slug) => (
          <TaxRow key={slug} slug={slug} kids={roots[slug]} depth={0} kind={kind} />
        ))}
      </div>
    </div>
  );
}

function TaxRow({
  slug,
  kids,
  depth,
  kind,
}: {
  slug: string;
  kids: TaxTree;
  depth: number;
  kind: PrimitiveKind;
}) {
  const [open, setOpen] = useState(true);
  const { data: prims = [] } = usePrimitives();
  const p = prims.find((x: Primitive) => x.id === slug);
  const childKeys = Object.keys(kids);
  const hasKids = childKeys.length > 0;
  const Ico = KIND_ICON[(p?.kind ?? kind) as PrimitiveKind];
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 6px",
          borderRadius: 4,
          marginLeft: depth * 18,
        }}
      >
        {hasKids ? (
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              color: "var(--ink-3)",
              cursor: "pointer",
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 120ms",
              display: "inline-flex",
            }}
          >
            <I.ChevRight size={11} />
          </button>
        ) : (
          <span style={{ width: 11, display: "inline-block" }} />
        )}
        <Ico size={12} style={{ color: "var(--ink-3)" }} />
        <span className="mono" style={{ fontSize: 12, color: "var(--ink)" }}>
          {slug}
        </span>
        {hasKids && (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
            {childKeys.length}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {p && <Hash value={p.hash} mute />}
      </div>
      {open && childKeys.map((c) => <TaxRow key={c} slug={c} kids={kids[c]} depth={depth + 1} kind={kind} />)}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th
      style={{
        padding: "6px 12px",
        fontWeight: 600,
        fontSize: 11,
        color: "var(--ink-3)",
        textTransform: "uppercase",
        letterSpacing: 0.6,
        borderBottom: "1px solid var(--line)",
      }}
    >
      {children}
    </th>
  );
}
function Td({ children }: { children: ReactNode }) {
  return <td style={{ padding: "6px 12px", color: "var(--ink-2)" }}>{children}</td>;
}
