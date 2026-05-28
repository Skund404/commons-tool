import { useState } from "react";
import {
  Button,
  Hash,
  I,
  Input,
  KindGlyph,
  LangBadge,
  Toolbar,
} from "@/components";
import { FED_ROOTS, PRIMS } from "@/fixtures";
import type { Primitive } from "@/types/primitives";

const BINDERY_EMITTER = "opg://c2e1a8d4-bb27-4ef0-9a13-7e8c5f1a23bd";

const BOOKBINDING_PRIMS: Primitive[] = [
  {
    id: "bone-folder",
    kind: "tool",
    name: "Bone Folder",
    slug: "bone-folder",
    desc: "Polished bone or PTFE tool for creasing and smoothing paper.",
    hash: "sha256:b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0",
    emitter: BINDERY_EMITTER,
    license: "CC-BY-4.0",
    state: "published",
    tags: [],
    names: {
      en: { canonical: "bone folder", aliases: [] },
      fr: { canonical: "plioir", aliases: [] },
      de: { canonical: "Falzbein", aliases: [] },
    },
    specializes: null,
    rel: [],
    domain: { category: null, manufacturer: null },
  },
  {
    id: "japanese-stab",
    kind: "technique",
    name: "Japanese Stab Binding",
    slug: "japanese-stab",
    desc: "Four-hole Japanese stab binding — yotsume toji.",
    hash: "sha256:b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1",
    emitter: BINDERY_EMITTER,
    license: "CC-BY-4.0",
    state: "published",
    tags: [],
    names: {
      en: { canonical: "Japanese stab binding", aliases: ["yotsume toji"] },
      fr: { canonical: "reliure japonaise", aliases: [] },
      ja: { canonical: "四つ目綴じ", aliases: [] },
    },
    specializes: null,
    rel: [],
    domain: { skillLevel: "intermediate", steps: 6 },
  },
  {
    id: "kozo",
    kind: "material",
    name: "Kōzo Paper",
    slug: "kozo",
    desc: "Mulberry-fiber Japanese paper, prized for strength and translucency.",
    hash: "sha256:b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
    emitter: BINDERY_EMITTER,
    license: "CC-BY-4.0",
    state: "published",
    tags: [],
    names: {
      en: { canonical: "kōzo paper", aliases: ["mulberry paper"] },
      ja: { canonical: "楮", aliases: [] },
    },
    specializes: null,
    rel: [],
    domain: { materialType: "paper", unit: "sheet" },
  },
  {
    id: "awl-bindery",
    kind: "tool",
    name: "Bookbinder's Awl",
    slug: "binding-awl",
    desc: "Slim awl for piercing signatures.",
    hash: "sha256:b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3",
    emitter: BINDERY_EMITTER,
    license: "CC-BY-4.0",
    state: "published",
    tags: [],
    names: {
      en: { canonical: "binding awl", aliases: [] },
      fr: { canonical: "poinçon de reliure", aliases: [] },
      ja: { canonical: "目打ち", aliases: [] },
    },
    specializes: null,
    rel: [],
    domain: { category: null, manufacturer: null },
  },
  {
    id: "linen-thread",
    kind: "material",
    name: "Unwaxed Linen Thread",
    slug: "linen-thread-unwaxed",
    desc: "Natural linen thread for binding signatures.",
    hash: "sha256:b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4",
    emitter: BINDERY_EMITTER,
    license: "CC-BY-4.0",
    state: "published",
    tags: [],
    names: {
      en: { canonical: "unwaxed linen thread", aliases: [] },
      fr: { canonical: "fil de lin non ciré", aliases: [] },
    },
    specializes: null,
    rel: [],
    domain: { materialType: "thread", unit: "m" },
  },
];

export function PaneFederation() {
  const [active, setActive] = useState(FED_ROOTS[2]?.id ?? FED_ROOTS[0]?.id ?? "");
  const root = FED_ROOTS.find((r) => r.id === active);
  if (!root) return null;
  const isPrimary = root.role === "primary";

  const visible: Primitive[] = isPrimary
    ? PRIMS
    : root.id === "leatherworker-de"
      ? PRIMS.slice(0, 5)
      : BOOKBINDING_PRIMS;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Globe size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Federation</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · browse other commons; fork into yours
            </span>
          </>
        }
        right={
          <>
            <Button variant="default" size="sm" icon={<I.Plus size={12} />}>
              Add root
            </Button>
            <Button variant="ghost" size="sm" icon={<I.Refresh size={12} />}>
              Sync all
            </Button>
          </>
        }
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "260px 1fr", minHeight: 0 }}>
        <div
          style={{
            borderRight: "1px solid var(--line)",
            background: "var(--surface)",
            overflowY: "auto",
          }}
        >
          {FED_ROOTS.map((r) => {
            const a = r.id === active;
            return (
              <button
                key={r.id}
                onClick={() => setActive(r.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  background: a ? "var(--surface-2)" : "transparent",
                  border: 0,
                  borderLeft: a ? "2px solid var(--accent)" : "2px solid transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <I.Globe
                    size={13}
                    style={{ color: r.role === "primary" ? "var(--accent)" : "var(--ink-3)" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                  {r.url}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                    fontSize: 11,
                    color: "var(--ink-3)",
                  }}
                >
                  <span>{r.primCount} primitives</span>
                  <span>last sync {r.lastSync}</span>
                </div>
                {r.craft && (
                  <div style={{ marginTop: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: "var(--surface-3)",
                        color: "var(--ink-3)",
                        fontWeight: 600,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      {r.craft}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ overflowY: "auto", padding: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{root.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {root.role === "primary" ? "Your primary commons" : "Read-only federated root"}
                {root.craft && ` · ${root.craft} domain`}
              </div>
            </div>
            <Input
              leadingIcon={<I.Search size={12} />}
              placeholder="Search this root…"
              style={{ width: 240 }}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {visible.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <KindGlyph kind={p.kind} size={14} />
                  {!isPrimary && (
                    <Button variant="default" size="sm" icon={<I.GitCommit size={11} />}>
                      Fork to local
                    </Button>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                  {p.slug}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-2)",
                    marginTop: 8,
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
                    {Object.keys(p.names).map((l) => (
                      <LangBadge key={l} lang={l} present />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
