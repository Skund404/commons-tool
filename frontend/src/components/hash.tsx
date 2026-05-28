import { useState } from "react";
import { copyToClipboard, truncateHash } from "@/lib/hash";

interface HashProps {
  value: string;
  full?: boolean;
  mute?: boolean;
}

export function Hash({ value, full, mute }: HashProps) {
  const [copied, setCopied] = useState(false);
  const v =
    value ?? "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  const display = full ? v : truncateHash(v);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void copyToClipboard(v).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
      }
    });
  };

  return (
    <span
      className="mono"
      title={copied ? "Copied!" : v}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: mute ? "var(--ink-4)" : "var(--ink-3)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span>{display}</span>
      {copied && <span style={{ color: "var(--sev-approve)", fontSize: 10 }}>copied</span>}
    </span>
  );
}
