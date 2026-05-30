import { useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  I,
  Segmented,
  SeverityChip,
  SeverityDot,
  Tabs,
  Toolbar,
} from "@/components";
import {
  useRegenerateIndexes,
  useResolveIndexes,
  useTaxonomyIndexes,
  type TaxNode,
} from "@/api/hooks";

type LangKey = "en" | "de" | "fr";
type IndexTab = "resolve" | "taxonomy";
type TaxView = "tree" | "json";

// PaneIndex inspects the real generated indexes (addendum §A.5/§A.7): the
// cross-lingual resolve map and the category taxonomy tree, read from
// /api/indexes/resolve + /api/indexes/taxonomy. Read-only; the Regenerate
// action rebuilds them from the corpus.
export function PaneIndex() {
  const [tab, setTab] = useState<IndexTab>("resolve");
  const [lang, setLang] = useState<LangKey>("en");
  const [taxView, setTaxView] = useState<TaxView>("tree");
  const { data: RESOLVE } = useResolveIndexes();
  const { data: TAX } = useTaxonomyIndexes();
  const regen = useRegenerateIndexes();

  const resolveFile = RESOLVE?.[lang];
  const rows = useMemo(() => {
    const out: {
      key: string;
      ref: string;
      cls: string;
      kind: string | null;
      name: string;
      canon: boolean;
    }[] = [];
    if (!resolveFile) return out;
    for (const [key, entries] of Object.entries(resolveFile.entries)) {
      for (const e of entries) {
        out.push({ key, ref: e.ref, cls: e.class, kind: e.kind, name: e.name, canon: e.canonical });
      }
    }
    return out; // keys already sorted by the generator
  }, [resolveFile]);

  const taxFile = TAX?.[lang];
  const taxRoots = taxFile ? Object.values(taxFile.tree) : [];
  const nodeCount = (function count(ns: TaxNode[]): number {
    let n = 0;
    for (const node of ns) n += 1 + count(node.children);
    return n;
  })(taxRoots);

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
          {tab === "resolve" ? `${rows.length} entries` : `${nodeCount} nodes`}
        </span>
      </div>

      {tab === "resolve" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--surface-2)", textAlign: "left" }}>
                <Th>Key</Th>
                <Th>Class</Th>
                <Th>Kind</Th>
                <Th>Name</Th>
                <Th>Ref</Th>
                <Th>Canonical</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                  <Td>
                    <span className={r.canon ? "" : "mono"} style={{ color: r.canon ? "var(--ink)" : "var(--ink-2)" }}>
                      {r.key}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: "var(--ink-3)", fontSize: 11 }}>{r.cls}</span>
                  </Td>
                  <Td>
                    <span style={{ color: "var(--ink-3)", fontSize: 11 }}>{r.kind ?? "—"}</span>
                  </Td>
                  <Td>{r.name}</Td>
                  <Td>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.ref}</span>
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
              <div style={{ padding: "10px 8px" }}>
                {taxRoots.map((r) => (
                  <TaxRow key={r.id} node={r} depth={0} />
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
                {JSON.stringify(taxFile ?? {}, null, 2)}
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
            <SeverityDot sev="approve" /> Read-only view of{" "}
            <span className="mono">indexes/taxonomy/{lang}.json</span>.
          </div>
        </div>
      )}
    </div>
  );
}

function TaxRow({ node, depth }: { node: TaxNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const hasKids = node.children.length > 0 || node.members.length > 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", marginLeft: depth * 18 }}>
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
        <I.Tree size={12} style={{ color: "var(--ink-3)" }} />
        <span style={{ fontSize: 12.5 }}>{node.name}</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>{node.id}</span>
        {node.members.length > 0 && (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>· {node.members.length}m</span>
        )}
      </div>
      {open && (
        <>
          {node.members.map((m) => (
            <div
              key={m.ref}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 6px",
                marginLeft: (depth + 1) * 18,
                fontSize: 12,
                color: "var(--ink-2)",
              }}
            >
              <I.Tag size={11} style={{ color: "var(--ink-4)" }} />
              <span>{m.name}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>{m.slug}</span>
            </div>
          ))}
          {node.children.map((c) => (
            <TaxRow key={c.id} node={c} depth={depth + 1} />
          ))}
        </>
      )}
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
