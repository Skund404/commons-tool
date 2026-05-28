import { useEffect, useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { SeverityDot } from "./severity";
import { I } from "./icons";

interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  kind: "primitive" | "bundle";
  name: string;
  slug: string;
  onConfirm: () => void;
}

export function DeleteConfirmModal({
  open,
  onClose,
  kind,
  name,
  slug,
  onConfirm,
}: DeleteConfirmModalProps) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  if (!open) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${kind} "${name}"`}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" icon={<I.Trash size={12} />} onClick={onConfirm}>
            Delete {kind}
          </Button>
        </>
      }
    >
      <div
        style={{
          padding: "10px 12px",
          marginBottom: 12,
          background: "var(--sev-reject-soft)",
          border: "1px solid rgba(178,58,44,0.2)",
          borderRadius: 5,
          fontSize: 12.5,
          color: "var(--ink-2)",
          lineHeight: 1.55,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <SeverityDot sev="reject" style={{ marginTop: 2 }} />
        <div>
          Deletion creates a{" "}
          <b className="mono" style={{ color: "var(--sev-reject)" }}>
            lifecycle_transition
          </b>{" "}
          event. The record is preserved in git history — only removed from the active corpus.
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 12 }}>
        About to delete <b>{name}</b> (<span className="mono">{slug}</span>). Downstream effects:
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--ink-3)" }}>
          <li>Resolve indexes will drop entries pointing at this {kind}</li>
          {kind === "primitive" && (
            <li>Bundles containing this primitive will be flagged for review</li>
          )}
          {kind === "bundle" && <li>Federated mirrors may need to re-sync</li>}
          <li>Lifecycle event recorded against your emitter</li>
        </ul>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        Reason (optional)
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this being deleted?"
        style={{
          width: "100%",
          minHeight: 64,
          padding: 8,
          background: "var(--surface)",
          border: "1px solid var(--line-2)",
          borderRadius: 5,
          outline: 0,
          resize: "vertical",
          fontFamily: "inherit",
          fontSize: 13,
          color: "var(--ink)",
        }}
      />
    </Modal>
  );
}
