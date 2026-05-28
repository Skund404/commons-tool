import type { Severity } from "@/types/primitives";
import { I, type IconProps } from "./icons";
import { useTweaks } from "./tweaks-context";

interface SevDef {
  label: string;
  color: string;
  soft: string;
  Icon: React.ComponentType<IconProps>;
}

export const SEV: Record<Severity, SevDef> = {
  approve: {
    label: "APPROVE",
    color: "var(--sev-approve)",
    soft: "var(--sev-approve-soft)",
    Icon: I.Check,
  },
  warn: {
    label: "WARN",
    color: "var(--sev-warn)",
    soft: "var(--sev-warn-soft)",
    Icon: I.Warn,
  },
  reject: {
    label: "REJECT",
    color: "var(--sev-reject)",
    soft: "var(--sev-reject-soft)",
    Icon: I.X,
  },
  info: {
    label: "INFO",
    color: "var(--sev-info)",
    soft: "var(--sev-info-soft)",
    Icon: I.Info,
  },
};

interface SeverityDotProps {
  sev: Severity;
  size?: number;
  style?: React.CSSProperties;
}

// Filled-style by default; honors tweaks-panel `sevStyle` setting.
export function SeverityDot({ sev, size = 18, style }: SeverityDotProps) {
  const { tweaks } = useTweaks();
  const sevStyle = tweaks.sevStyle;
  const s = SEV[sev];
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size,
    height: size,
    borderRadius: size / 2,
    flex: "none",
    ...style,
  };

  if (sevStyle === "outline") {
    return (
      <span
        style={{
          ...base,
          border: `1.5px solid ${s.color}`,
          color: s.color,
        }}
      >
        <s.Icon size={Math.round(size * 0.6)} stroke={2.4} />
      </span>
    );
  }
  if (sevStyle === "glyph") {
    return (
      <span style={{ ...base, color: s.color }}>
        <s.Icon size={Math.round(size * 0.78)} stroke={2.2} />
      </span>
    );
  }
  return (
    <span style={{ ...base, background: s.color, color: "#fff" }}>
      <s.Icon size={Math.round(size * 0.6)} stroke={2.6} />
    </span>
  );
}

interface SeverityChipProps {
  sev: Severity;
  count?: number;
}

export function SeverityChip({ sev, count }: SeverityChipProps) {
  const s = SEV[sev];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px 1px 4px",
        borderRadius: 10,
        background: s.soft,
        color: s.color,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        lineHeight: 1.4,
      }}
    >
      <s.Icon size={11} stroke={2.4} />
      {count != null ? `${count} ${s.label}` : s.label}
    </span>
  );
}
