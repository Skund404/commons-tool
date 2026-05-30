import { useState } from "react";
import { Card, Empty, I, KIND_ICON, Segmented, Toolbar } from "@/components";
import { useTaxonomyIndexes, type TaxNode } from "@/api/hooks";
import type { PrimitiveKind } from "@/types/primitives";

type LangKey = "en" | "de" | "fr";

// PaneTaxonomy renders the generated category taxonomy (addendum §A.7): an
// authored category skeleton with primitives attached as members. It reads the
// real derived index (indexes/taxonomy/<lang>.json) rather than reconstructing
// from primitives — taxonomy is category-native, not a primitive `specializes`
// chain.
export function PaneTaxonomy() {
  const [lang, setLang] = useState<LangKey>("en");
  const { data: TAX, isLoading } = useTaxonomyIndexes();

  const file = TAX?.[lang];
  const roots = file ? Object.values(file.tree) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Tree size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Taxonomy</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · authored category skeleton + attached members
            </span>
          </>
        }
        right={
          <Segmented<LangKey>
            value={lang}
            onChange={setLang}
            options={["en", "de", "fr"] as LangKey[]}
          />
        }
      />
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {roots.length === 0 ? (
          <Empty
            icon={<I.Tree size={20} />}
            title={isLoading ? "Loading taxonomy…" : "No categories yet"}
            body="Author categories under indexes/categories/ and tag primitives with properties.taxonomy to populate the tree."
          />
        ) : (
          <Card padded={false} style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ padding: "10px 12px" }}>
              {roots.map((r) => (
                <CategoryNode key={r.id} node={r} depth={0} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function CategoryNode({ node, depth }: { node: TaxNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0 || node.members.length > 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          borderRadius: 4,
          marginLeft: depth * 18,
          cursor: hasChildren ? "pointer" : "default",
        }}
        onClick={() => hasChildren && setOpen((o) => !o)}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {hasChildren ? (
          <span
            style={{
              color: "var(--ink-3)",
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform 120ms",
              display: "inline-flex",
            }}
          >
            <I.ChevRight size={12} />
          </span>
        ) : (
          <span style={{ width: 12, display: "inline-block" }} />
        )}
        <I.Tree size={13} style={{ color: "var(--ink-3)" }} />
        <span style={{ fontSize: 13 }}>{node.name}</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 4 }}>
          {node.id}
        </span>
        {node.members.length > 0 && (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
            · {node.members.length} member{node.members.length > 1 ? "s" : ""}
          </span>
        )}
        {node.related.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--ink-4)" }}>
            ↔ {node.related.join(", ")}
          </span>
        )}
      </div>
      {open && (
        <>
          {node.members.map((m) => {
            const Ico = KIND_ICON[m.kind as PrimitiveKind] ?? I.Tag;
            return (
              <div
                key={m.ref}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  marginLeft: (depth + 1) * 18,
                  fontSize: 12.5,
                  color: "var(--ink-2)",
                }}
              >
                <Ico size={12} style={{ color: "var(--ink-4)" }} />
                <span>{m.name}</span>
                <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
                  {m.slug}
                </span>
              </div>
            );
          })}
          {node.children.map((c) => (
            <CategoryNode key={c.id} node={c} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  );
}
