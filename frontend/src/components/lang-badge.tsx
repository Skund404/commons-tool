interface LangBadgeProps {
  lang: string;
  present?: boolean;
}

export function LangBadge({ lang, present }: LangBadgeProps) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        padding: "1px 5px",
        borderRadius: 3,
        letterSpacing: 0.4,
        background: present ? "var(--accent-soft)" : "var(--surface-2)",
        color: present ? "var(--accent)" : "var(--ink-4)",
        fontWeight: 600,
        textTransform: "uppercase",
        border: present ? "1px solid transparent" : "1px solid var(--line)",
        display: "inline-block",
        lineHeight: 1.3,
      }}
    >
      {lang}
    </span>
  );
}
