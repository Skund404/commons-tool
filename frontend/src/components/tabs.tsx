import type { ReactNode } from "react";

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

interface TabsProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  items: TabItem<T>[];
  dense?: boolean;
}

export function Tabs<T extends string>({ value, onChange, items, dense }: TabsProps<T>) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--line)",
        paddingLeft: dense ? 0 : 4,
      }}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              padding: dense ? "6px 10px" : "8px 14px",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--ink)" : "var(--ink-3)",
              borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {it.icon}
            {it.label}
            {it.badge != null && (
              <span
                style={{
                  fontSize: 10,
                  padding: "0 5px",
                  borderRadius: 8,
                  background: active ? "var(--accent-soft)" : "var(--surface-3)",
                  color: active ? "var(--accent)" : "var(--ink-3)",
                }}
              >
                {it.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
