import { I } from "@/components";

export function StatusBar() {
  return (
    <div
      style={{
        height: 24,
        flex: "none",
        background: "var(--surface)",
        borderTop: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 12px",
        fontSize: 11,
        color: "var(--ink-3)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <I.Branch size={10} /> main
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <I.GitCommit size={10} /> a7f4c2e
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <I.User size={10} /> @rillmark
      </span>
      <span style={{ flex: 1 }} />
      <span>3 PRs open</span>
      <span>·</span>
      <span>6 local changes</span>
      <span>·</span>
      <span style={{ color: "var(--sev-approve)", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <I.Check size={10} /> validated 2h ago
      </span>
    </div>
  );
}
