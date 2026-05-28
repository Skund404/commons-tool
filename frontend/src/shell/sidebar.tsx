import { NAV, type PaneId } from "@/nav";

interface SidebarProps {
  labels: boolean;
  pane: PaneId;
  setPane: (id: PaneId) => void;
}

const BADGES: Partial<Record<PaneId, number>> = {
  publish: 3,
  review: 3,
};

export function Sidebar({ labels, pane, setPane }: SidebarProps) {
  return (
    <nav
      style={{
        borderRight: "1px solid var(--line)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        paddingTop: 10,
        overflow: "hidden",
      }}
    >
      {labels && (
        <div
          style={{
            padding: "0 14px 6px",
            fontSize: 10,
            color: "var(--ink-3)",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 600,
          }}
        >
          Navigate
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", padding: "0 6px", gap: 1 }}>
        {NAV.map((n) => {
          const Ico = n.icon;
          const active = n.id === pane;
          const badge = BADGES[n.id];
          return (
            <button
              key={n.id}
              onClick={() => setPane(n.id)}
              title={!labels ? n.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: labels ? "5px 8px" : "8px",
                border: 0,
                borderRadius: 5,
                cursor: "pointer",
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent)" : "var(--ink-2)",
                fontWeight: active ? 600 : 500,
                fontSize: 12.5,
                textAlign: "left",
                justifyContent: labels ? "flex-start" : "center",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--surface-2)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <Ico size={15} stroke={1.6} />
              {labels && <span style={{ flex: 1 }}>{n.label}</span>}
              {labels && badge != null && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "0 5px",
                    borderRadius: 8,
                    lineHeight: 1.4,
                    background: active ? "var(--accent)" : "var(--surface-3)",
                    color: active ? "#fff" : "var(--ink-3)",
                  }}
                >
                  {badge}
                </span>
              )}
              {!labels && badge != null && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: "var(--accent)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          padding: labels ? "10px 12px" : "10px 6px",
          borderTop: "1px solid var(--line)",
        }}
      >
        {labels ? (
          <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 600,
                color: "var(--ink-2)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: "var(--sev-approve)",
                }}
              />{" "}
              Up to date
            </div>
            <div style={{ marginTop: 2 }}>federation · 2h ago</div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: "var(--sev-approve)",
              }}
            />
          </div>
        )}
      </div>
    </nav>
  );
}
