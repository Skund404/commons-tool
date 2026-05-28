import type { ReactNode } from "react";

export type SegmentedOption<T extends string> = T | { value: T; label: string; icon?: ReactNode };

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
}

export function Segmented<T extends string>({ value, onChange, options }: SegmentedProps<T>) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 5,
      }}
    >
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const lbl = typeof o === "string" ? o : o.label;
        const icon = typeof o === "object" ? o.icon : undefined;
        const active = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              background: active ? "var(--surface)" : "transparent",
              border: 0,
              padding: "3px 10px",
              fontSize: 12,
              color: active ? "var(--ink)" : "var(--ink-3)",
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              borderRadius: 4,
              lineHeight: 1.3,
              boxShadow: active ? "var(--shadow-1)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {icon}
            {lbl}
          </button>
        );
      })}
    </div>
  );
}
