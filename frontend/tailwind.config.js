/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutrals — warm off-whites and charcoals
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        line: {
          DEFAULT: "var(--line)",
          2: "var(--line-2)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
          4: "var(--ink-4)",
        },
        // Accent — burnt sienna (overridable via tweaks panel)
        accent: {
          DEFAULT: "var(--accent)",
          2: "var(--accent-2)",
          soft: "var(--accent-soft)",
        },
        // Severity colors
        sev: {
          reject: "var(--sev-reject)",
          "reject-soft": "var(--sev-reject-soft)",
          warn: "var(--sev-warn)",
          "warn-soft": "var(--sev-warn-soft)",
          info: "var(--sev-info)",
          "info-soft": "var(--sev-info-soft)",
          approve: "var(--sev-approve)",
          "approve-soft": "var(--sev-approve-soft)",
        },
        // Primitive lifecycle states
        st: {
          draft: "var(--st-draft)",
          validated: "var(--st-validated)",
          staged: "var(--st-staged)",
          published: "var(--st-published)",
        },
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // Densify defaults to match prototype's 13px base
        "2xs": "10px",
        xs: "11px",
        "xs.5": "11.5px",
        sm: "12px",
        "sm.5": "12.5px",
        base: "13px",
        md: "14px",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200px 0" },
          "100%": { backgroundPosition: "200px 0" },
        },
        fade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
        fade: "fade 120ms ease-out",
      },
    },
  },
  plugins: [],
};
