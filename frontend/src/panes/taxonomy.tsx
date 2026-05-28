import { useState } from "react";
import {
  Card,
  Hash,
  I,
  KIND_ICON,
  Segmented,
  Toolbar,
} from "@/components";
import { PRIMS } from "@/fixtures";
import type { Primitive, PrimitiveKind } from "@/types/primitives";

type LangKey = "en" | "de" | "fr";
type KindFilter = "tool" | "material" | "technique";

export function PaneTaxonomy() {
  const [lang, setLang] = useState<LangKey>("en");
  const [kindFilter, setKindFilter] = useState<KindFilter>("tool");
  void lang;
  const roots = PRIMS.filter((p) => p.kind === kindFilter && !p.specializes);

  const childrenOf = (slug: string) => PRIMS.filter((p) => p.specializes === slug);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Tree size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Taxonomy</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · walks `specializes` chains
            </span>
          </>
        }
        right={
          <>
            <Segmented<LangKey>
              value={lang}
              onChange={setLang}
              options={["en", "de", "fr"] as LangKey[]}
            />
            <Segmented<KindFilter>
              value={kindFilter}
              onChange={setKindFilter}
              options={[
                { value: "tool", label: "Tool" },
                { value: "material", label: "Material" },
                { value: "technique", label: "Technique" },
              ]}
            />
          </>
        }
      />
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <Card padded={false} style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ padding: "10px 12px" }}>
            {roots.map((r) => (
              <TaxNode key={r.id} p={r} depth={0} childrenOf={childrenOf} />
            ))}
          </div>
        </Card>
        <div
          style={{
            maxWidth: 760,
            margin: "12px auto 0",
            fontSize: 11.5,
            color: "var(--ink-3)",
            padding: "0 12px",
          }}
        >
          Drag nodes to reparent. Cycles are detected and rejected automatically.
        </div>
      </div>
    </div>
  );
}

function TaxNode({
  p,
  depth,
  childrenOf,
}: {
  p: Primitive;
  depth: number;
  childrenOf: (slug: string) => Primitive[];
}) {
  const [open, setOpen] = useState(true);
  const kids = childrenOf(p.id);
  const Ico = KIND_ICON[p.kind as PrimitiveKind];
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
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {kids.length > 0 ? (
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
            <I.ChevRight size={12} />
          </button>
        ) : (
          <span style={{ width: 12, display: "inline-block" }} />
        )}
        <Ico size={13} style={{ color: "var(--ink-3)" }} />
        <span style={{ fontSize: 13 }}>{p.name}</span>
        {kids.length > 0 && (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 4 }}>
            {kids.length}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Hash value={p.hash} mute />
      </div>
      {open && kids.map((k) => <TaxNode key={k.id} p={k} depth={depth + 1} childrenOf={childrenOf} />)}
    </div>
  );
}
