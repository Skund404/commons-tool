import { I } from "@/components";

export function TitleBar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  return (
    <div
      style={{
        height: 36,
        flex: "none",
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "0 14px",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Logo />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          Commons Maintainer
        </span>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>·</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          Skund404/proto-commons
        </span>
        <span
          className="mono"
          style={{
            padding: "1px 6px",
            fontSize: 10,
            borderRadius: 3,
            background: "var(--surface-2)",
            color: "var(--ink-3)",
            border: "1px solid var(--line)",
            marginLeft: 2,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <I.Branch size={9} /> main
        </span>
      </div>
      <button
        type="button"
        onClick={() => onOpenSearch?.()}
        title="Search commons (⌘K)"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "3px 10px",
          borderRadius: 4,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          minWidth: 280,
          justifyContent: "center",
          fontSize: 11.5,
          color: "var(--ink-3)",
          cursor: onOpenSearch ? "pointer" : "default",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => {
          if (onOpenSearch) e.currentTarget.style.background = "var(--surface)";
        }}
        onMouseLeave={(e) => {
          if (onOpenSearch) e.currentTarget.style.background = "var(--surface-2)";
        }}
      >
        <I.Search size={11} />
        <span>Search commons</span>
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11.5,
            color: "var(--ink-3)",
          }}
        >
          <I.Dot size={10} style={{ color: "var(--sev-approve)" }} />
          gh authed
        </span>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>@rillmark</span>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            background: "var(--accent)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 11,
          }}
        >
          P
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="2" y="2" width="18" height="18" rx="3" fill="var(--accent)" />
      <path d="M7 7h8v3a5 5 0 0 1-5 5H7Z" fill="rgba(255,255,255,0.92)" />
      <rect x="9" y="11" width="2.4" height="4" fill="var(--accent)" />
    </svg>
  );
}
