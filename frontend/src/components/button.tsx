import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "default"
  | "ghost"
  | "danger"
  | "subtle"
  | "approve";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" },
  default: {
    background: "var(--surface)",
    color: "var(--ink)",
    borderColor: "var(--line-2)",
  },
  ghost: { background: "transparent", color: "var(--ink-2)", borderColor: "transparent" },
  danger: {
    background: "var(--surface)",
    color: "var(--sev-reject)",
    borderColor: "rgba(178, 58, 44, 0.27)",
  },
  subtle: {
    background: "var(--surface-2)",
    color: "var(--ink-2)",
    borderColor: "var(--line)",
  },
  approve: {
    background: "var(--sev-approve)",
    color: "#fff",
    borderColor: "var(--sev-approve)",
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", icon, children, style, onMouseEnter, onMouseLeave, ...rest },
  ref,
) {
  const padding =
    size === "sm" ? "3px 8px" : size === "lg" ? "8px 14px" : "5px 10px";
  const fontSize = size === "sm" ? 12 : 13;

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding,
    fontSize,
    fontWeight: 500,
    borderRadius: 5,
    border: "1px solid transparent",
    cursor: "pointer",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    transition: "background 120ms, border-color 120ms, color 120ms",
  };

  const v = VARIANTS[variant];

  const hoverBg =
    variant === "primary"
      ? "var(--accent-2)"
      : variant === "approve"
        ? "#6b8c47"
        : variant === "ghost"
          ? "var(--surface-2)"
          : "var(--surface-2)";

  return (
    <button
      ref={ref}
      {...rest}
      style={{ ...base, ...v, ...style }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = v.background as string;
        onMouseLeave?.(e);
      }}
    >
      {icon}
      {children}
    </button>
  );
});
