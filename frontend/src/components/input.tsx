import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leadingIcon, trailingIcon, error, style, ...rest },
  ref,
) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 8px",
        background: "var(--surface)",
        border: `1px solid ${error ? "var(--sev-reject)" : "var(--line-2)"}`,
        borderRadius: 5,
        height: 28,
        ...style,
      }}
    >
      {leadingIcon && <span style={{ color: "var(--ink-3)" }}>{leadingIcon}</span>}
      <input
        ref={ref}
        {...rest}
        style={{
          flex: 1,
          background: "transparent",
          border: 0,
          outline: 0,
          fontSize: 13,
          color: "var(--ink)",
          minWidth: 0,
          padding: 0,
        }}
      />
      {trailingIcon}
    </div>
  );
});
