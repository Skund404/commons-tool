import type { LifecycleState } from "@/types/primitives";

interface StateDef {
  label: string;
  color: string;
  soft: string;
}

const STATE: Record<LifecycleState, StateDef> = {
  draft: { label: "DRAFT", color: "var(--st-draft)", soft: "var(--surface-3)" },
  validated: {
    label: "VALIDATED",
    color: "var(--st-validated)",
    soft: "var(--sev-info-soft)",
  },
  staged: { label: "STAGED", color: "var(--st-staged)", soft: "var(--sev-warn-soft)" },
  published: {
    label: "PUBLISHED",
    color: "var(--st-published)",
    soft: "var(--sev-approve-soft)",
  },
  regen: { label: "REGEN", color: "var(--ink-3)", soft: "var(--surface-3)" },
};

interface StateBadgeProps {
  s: LifecycleState | string;
  size?: "sm" | "lg";
}

export function StateBadge({ s, size = "sm" }: StateBadgeProps) {
  const v =
    STATE[s as LifecycleState] ?? {
      label: String(s ?? "").toUpperCase(),
      color: "var(--ink-3)",
      soft: "var(--surface-3)",
    };
  const sz =
    size === "lg" ? { padding: "3px 8px", fontSize: 11 } : { padding: "1px 6px", fontSize: 10 };
  return (
    <span
      className="mono"
      style={{
        ...sz,
        fontWeight: 600,
        letterSpacing: 0.6,
        borderRadius: 3,
        background: v.soft,
        color: v.color,
        flex: "none",
        border: `1px solid ${v.color}33`,
        display: "inline-block",
        lineHeight: 1.4,
      }}
    >
      {v.label}
    </span>
  );
}
