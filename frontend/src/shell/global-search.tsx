import { useEffect, useState } from "react";
import { I, Input, KIND_ICON, Modal } from "@/components";
import { usePrimitives } from "@/api/hooks";
import type { PaneArgs } from "@/shell/pane-switch";
import type { PaneId } from "@/nav";
import type { Primitive } from "@/types/primitives";

// Global primitive search — opened from the TitleBar's search field, the
// search icon on the right of any pane, or Cmd/Ctrl+K from anywhere. Picking
// a primitive routes to the Editor with that primitive loaded.
export function GlobalSearchModal({
  open,
  onClose,
  go,
}: {
  open: boolean;
  onClose: () => void;
  go: (id: PaneId, args?: PaneArgs) => void;
}) {
  const { data: prims = [] } = usePrimitives();
  const [q, setQ] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setQ("");
      setFocusIdx(0);
    }
  }, [open]);

  const filtered = prims.filter(
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
        if (p) {
          go("editor", { slug: p.slug });
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, focusIdx, go, onClose]);

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Search commons" width={560}>
      <Input
        leadingIcon={<I.Search size={12} />}
        placeholder="Search primitives by name or slug…"
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
          maxHeight: 360,
          overflowY: "auto",
          border: "1px solid var(--line)",
          borderRadius: 5,
          background: "var(--surface)",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: 18,
              textAlign: "center",
              color: "var(--ink-3)",
              fontSize: 12,
            }}
          >
            No primitives match.
          </div>
        ) : (
          filtered.map((p: Primitive, i: number) => {
            const isFocused = i === focusIdx;
            const Ico = KIND_ICON[p.kind] ?? I.File;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  go("editor", { slug: p.slug });
                  onClose();
                }}
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
                  borderLeft: isFocused
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Ico size={14} style={{ color: "var(--ink-3)" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div
                    className="mono"
                    style={{ fontSize: 11, color: "var(--ink-3)" }}
                  >
                    {p.slug}
                  </div>
                </div>
                <span style={{ color: "var(--ink-3)" }}>
                  <I.ChevRight size={12} />
                </span>
              </button>
            );
          })
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)" }}>
        ↑ / ↓ to navigate · Enter to open · Esc to close
      </div>
    </Modal>
  );
}
