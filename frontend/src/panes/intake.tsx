import { useState, type ReactNode } from "react";
import {
  Button,
  Card,
  DeleteConfirmModal,
  Empty,
  I,
  KIND_ICON,
  KIND_LABEL,
  KindGlyph,
  SeverityChip,
  Toolbar,
} from "@/components";
import {
  useIntakeParse,
  useIntakeQueue,
  useDrafts,
  useStageDraft,
  useDeleteDraft,
  useValidateDraft,
  type IntakeItem,
  type DraftEnvelope,
} from "@/api/hooks";
import type { PaneArgs } from "@/shell/pane-switch";
import type { PaneId } from "@/nav";
import type { PrimitiveKind } from "@/types/primitives";

interface PaneProps {
  go: (id: PaneId, args?: PaneArgs) => void;
}

// Intake: paste raw JSON exports (Discord / Reddit shares from HideSync or
// any OPG-L producer), preview each candidate, then push approved ones into
// the draft queue. The bottom section is the live drafts queue with per-row
// edit / stage / discard actions.
export function PaneIntake({ go }: PaneProps) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [banner, setBanner] = useState<{
    kind: "ok" | "warn" | "err";
    msg: string;
  } | null>(null);

  const parseMut = useIntakeParse();
  const queueMut = useIntakeQueue();
  const { data: drafts = [], refetch: refetchDrafts } = useDrafts();
  const stageMut = useStageDraft();
  const deleteMut = useDeleteDraft();
  const validateMut = useValidateDraft();
  const [pendingDiscard, setPendingDiscard] = useState<DraftEnvelope | null>(null);

  const okItems = items.filter((it) => !it.error && it.source !== "unknown");
  const errorItems = items.filter((it) => !!it.error || it.source === "unknown");
  const queuableCount = okItems.filter((it) => included.has(it.index)).length;

  const flash = (kind: "ok" | "warn" | "err", msg: string) => {
    setBanner({ kind, msg });
    setTimeout(() => setBanner(null), 3000);
  };

  async function handleParse() {
    if (!text.trim()) return;
    try {
      const result = await parseMut.mutateAsync(text);
      setItems(result.items);
      // By default, mark all OK items as included.
      setIncluded(
        new Set(
          result.items
            .filter((it) => !it.error && it.source !== "unknown")
            .map((it) => it.index),
        ),
      );
      if (result.errors > 0) {
        flash(
          "warn",
          `Parsed ${result.ok_count} primitive(s); ${result.errors} error(s).`,
        );
      } else {
        flash("ok", `Parsed ${result.ok_count} primitive(s).`);
      }
    } catch (e) {
      flash("err", "Parse failed: " + (e as Error).message);
    }
  }

  async function handleQueue() {
    const bodies = okItems
      .filter((it) => included.has(it.index))
      .map((it) => it.ui_body ?? {});
    if (bodies.length === 0) {
      flash("warn", "No items selected.");
      return;
    }
    try {
      const result = await queueMut.mutateAsync(bodies);
      flash(
        "ok",
        `Queued ${result.drafts.length} draft(s)${result.errors?.length ? ` (${result.errors.length} failed)` : ""}.`,
      );
      setText("");
      setItems([]);
      setIncluded(new Set());
      refetchDrafts();
    } catch (e) {
      flash("err", "Queue failed: " + (e as Error).message);
    }
  }

  async function handleStageDraft(d: DraftEnvelope) {
    try {
      await stageMut.mutateAsync(d.id);
      flash("ok", `Staged ${d.slug ?? d.id}`);
      go("browser", { slug: d.slug });
    } catch (e) {
      flash("err", "Stage failed: " + (e as Error).message);
    }
  }

  async function handleValidateDraft(d: DraftEnvelope) {
    try {
      const result = await validateMut.mutateAsync(d.id);
      if (result.ok) {
        flash("ok", `${d.slug ?? d.id} validates`);
      } else {
        flash(
          "warn",
          `${d.slug ?? d.id}: ${result.errors?.length ?? 0} issue(s)`,
        );
      }
    } catch (e) {
      flash("err", "Validate failed: " + (e as Error).message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Upload size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Intake</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · paste shared primitives → review → queue
            </span>
          </>
        }
        right={
          <span
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <I.File size={11} /> {drafts.length} draft{drafts.length === 1 ? "" : "s"} pending
          </span>
        }
      />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* PASTE + PARSE */}
        <Card
          title="Paste raw JSON"
          subtitle="Single object, array, NDJSON, or --- separated. Accepts OPG-L spec shape or commons UI shape."
          padded={false}
        >
          <div style={{ padding: 12 }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='Paste here — e.g. {"slug":"french-skiver","kind":"tool", ...}  or  [{...}, {...}]'
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 200,
                padding: 10,
                background: "var(--surface)",
                border: "1px solid var(--line-2)",
                borderRadius: 5,
                outline: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--ink)",
                resize: "vertical",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {text.trim() ? `${text.length} chars` : "empty"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setText("");
                    setItems([]);
                    setIncluded(new Set());
                  }}
                  disabled={!text && items.length === 0}
                >
                  Clear
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<I.Search size={12} />}
                  onClick={handleParse}
                  disabled={!text.trim() || parseMut.isPending}
                >
                  {parseMut.isPending ? "Parsing…" : "Parse"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* PREVIEW */}
        {items.length > 0 && (
          <Card
            title={`Preview · ${okItems.length} ok · ${errorItems.length} error`}
            subtitle="Uncheck rows you don't want to queue. Spec-shape docs are converted to UI shape automatically."
            padded={false}
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<I.Upload size={12} />}
                onClick={handleQueue}
                disabled={queuableCount === 0 || queueMut.isPending}
              >
                {queueMut.isPending
                  ? "Queueing…"
                  : `Queue selected (${queuableCount})`}
              </Button>
            }
          >
            <PreviewList
              items={items}
              included={included}
              onToggle={(idx) => {
                const n = new Set(included);
                if (n.has(idx)) n.delete(idx);
                else n.add(idx);
                setIncluded(n);
              }}
            />
          </Card>
        )}

        {/* DRAFTS QUEUE */}
        <Card
          title={`Drafts queue · ${drafts.length}`}
          subtitle="Pasted, unsaved candidates. Edit / Validate / Stage / Discard per row."
          padded={false}
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={<I.Refresh size={12} />}
              onClick={() => refetchDrafts()}
            >
              Refresh
            </Button>
          }
        >
          {drafts.length === 0 ? (
            <div style={{ padding: 30 }}>
              <Empty
                icon={<I.File size={20} />}
                title="No drafts yet"
                body="Paste JSON above to start. Queued drafts will live here until you Stage them into the corpus."
              />
            </div>
          ) : (
            drafts.map((d, i) => (
              <DraftRow
                key={d.id}
                d={d}
                first={i === 0}
                onEdit={() => go("editor", { slug: d.slug })}
                onValidate={() => handleValidateDraft(d)}
                onStage={() => handleStageDraft(d)}
                onDiscard={() => setPendingDiscard(d)}
                busy={
                  (stageMut.isPending && stageMut.variables === d.id) ||
                  (validateMut.isPending && validateMut.variables === d.id) ||
                  (deleteMut.isPending && deleteMut.variables === d.id)
                }
              />
            ))
          )}
        </Card>
      </div>

      <DeleteConfirmModal
        open={!!pendingDiscard}
        onClose={() => setPendingDiscard(null)}
        kind="primitive"
        name={pendingDiscard?.title ?? pendingDiscard?.slug ?? "this draft"}
        slug={pendingDiscard?.slug ?? pendingDiscard?.id ?? ""}
        onConfirm={async () => {
          if (!pendingDiscard) return;
          try {
            await deleteMut.mutateAsync(pendingDiscard.id);
            flash("ok", "Draft discarded");
          } catch (e) {
            flash("err", "Discard failed: " + (e as Error).message);
          }
          setPendingDiscard(null);
        }}
      />

      {banner && <Banner kind={banner.kind} msg={banner.msg} />}
    </div>
  );
}

function PreviewList({
  items,
  included,
  onToggle,
}: {
  items: IntakeItem[];
  included: Set<number>;
  onToggle: (idx: number) => void;
}) {
  return (
    <div>
      {items.map((it, i) => {
        const isError = !!it.error || it.source === "unknown";
        const hasConflict = !!it.conflict;
        const checked = included.has(it.index);
        const Ico = it.kind
          ? (KIND_ICON[it.kind as PrimitiveKind] ?? I.File)
          : I.File;
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 28px 1fr 90px 110px",
              gap: 10,
              alignItems: "center",
              padding: "10px 12px",
              borderTop: i === 0 ? "0" : "1px solid var(--line)",
              opacity: isError ? 0.7 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(it.index)}
              disabled={isError}
              style={{ cursor: isError ? "not-allowed" : "pointer" }}
            />
            <Ico size={14} style={{ color: "var(--ink-3)" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {it.name || it.slug || "(unnamed)"}
              </div>
              <div
                className="mono"
                style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}
              >
                {it.slug ?? "—"}
                {it.kind && <> · {KIND_LABEL[it.kind as PrimitiveKind] ?? it.kind}</>}
                {it.source && it.source !== "unknown" && (
                  <>
                    {" · "}
                    <span style={{ color: it.source === "spec" ? "var(--accent)" : "var(--ink-3)" }}>
                      {it.source}
                    </span>
                  </>
                )}
              </div>
              {isError && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--sev-reject)",
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {it.error ?? "Could not detect a primitive shape"}
                </div>
              )}
              {hasConflict && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--sev-warn)",
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {it.conflict}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              {isError ? (
                <SeverityChip sev="reject" />
              ) : hasConflict ? (
                <SeverityChip sev="warn" />
              ) : (
                <SeverityChip sev="approve" />
              )}
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "var(--ink-3)" }}>
              {checked && !isError ? "will queue" : "skip"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DraftRow({
  d,
  first,
  onEdit,
  onValidate,
  onStage,
  onDiscard,
  busy,
}: {
  d: DraftEnvelope;
  first: boolean;
  onEdit: () => void;
  onValidate: () => void;
  onStage: () => void;
  onDiscard: () => void;
  busy?: boolean;
}) {
  const Ico = d.kind
    ? (KIND_ICON[d.kind as PrimitiveKind] ?? I.File)
    : I.File;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr 200px 280px",
        gap: 10,
        alignItems: "center",
        padding: "10px 14px",
        borderTop: first ? "0" : "1px solid var(--line)",
        opacity: busy ? 0.5 : 1,
        transition: "opacity 120ms",
      }}
    >
      <Ico size={14} style={{ color: "var(--ink-3)" }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {d.title || d.slug || "(untitled draft)"}
        </div>
        <div
          className="mono"
          style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}
        >
          {d.slug ?? "—"}
          {d.kind && <> · {KIND_LABEL[d.kind as PrimitiveKind] ?? d.kind}</>}
          {" · id="}
          {d.id.slice(0, 24)}
          …
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {new Date(d.modified_at).toLocaleString()}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" icon={<I.EditPen size={11} />} onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<I.Check size={11} />}
          onClick={onValidate}
          disabled={busy}
        >
          Validate
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<I.Upload size={11} />}
          onClick={onStage}
          disabled={busy}
        >
          Stage
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={<I.Trash size={11} />}
          onClick={onDiscard}
          disabled={busy}
        />
      </div>
    </div>
  );
}

function Banner({ kind, msg }: { kind: "ok" | "warn" | "err"; msg: ReactNode }) {
  const color =
    kind === "ok"
      ? "var(--sev-approve, #2e5d35)"
      : kind === "warn"
        ? "var(--sev-warn, #8a5a0a)"
        : "var(--sev-reject, #802020)";
  const bg =
    kind === "ok"
      ? "var(--sev-approve-soft, #ddebd6)"
      : kind === "warn"
        ? "var(--sev-warn-soft, #f3e6c2)"
        : "var(--sev-reject-soft, #f3d0d0)";
  return (
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
        background: bg,
        color,
        border: `1px solid ${color}`,
        boxShadow: "0 6px 16px rgba(31,27,23,0.10)",
      }}
    >
      {msg}
    </div>
  );
}

// Suppress unused-component-prop deprecation warnings about KindGlyph until we
// actually need it in the row variants.
void KindGlyph;
