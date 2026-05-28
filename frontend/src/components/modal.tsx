import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { I } from "./icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, footer, width = 480 }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(31,27,23,0.34)",
            zIndex: 70,
            animation: "fade 120ms",
          }}
        />
        <Dialog.Content
          onEscapeKeyDown={onClose}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "var(--surface)",
            borderRadius: 8,
            width,
            maxWidth: "92vw",
            boxShadow: "var(--shadow-2)",
            border: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "84vh",
            zIndex: 71,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <Dialog.Title style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                style={{
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--ink-3)",
                  padding: 2,
                  display: "inline-flex",
                }}
              >
                <I.X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <div style={{ padding: "12px 14px", overflowY: "auto", flex: 1 }}>{children}</div>
          {footer && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "10px 14px",
                borderTop: "1px solid var(--line)",
                background: "var(--surface-2)",
              }}
            >
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
