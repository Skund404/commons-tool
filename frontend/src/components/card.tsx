import { useState, type ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  padded?: boolean;
  hover?: boolean;
}

export function Card({
  title,
  subtitle,
  action,
  children,
  style,
  padded = true,
  hover,
}: CardProps) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        boxShadow: hover && h ? "var(--shadow-1)" : "none",
        transition: "box-shadow 120ms, border-color 120ms",
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--ink)" }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{subtitle}</div>
            )}
          </div>
          {action}
        </div>
      )}
      <div style={{ padding: padded ? 12 : 0 }}>{children}</div>
    </div>
  );
}
