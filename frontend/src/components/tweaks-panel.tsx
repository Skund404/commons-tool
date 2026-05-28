import { useEffect, useRef } from "react";
import { useTweaks, type Density, type SevStyle } from "./tweaks-context";
import { isLightHex } from "@/lib/hex";
import { I } from "./icons";

// Compact tweaks panel modeled after the prototype's floating control surface.
// Replaces the prototype's iframe parent.postMessage protocol with a plain
// React context; values persist to localStorage.

const ACCENT_OPTIONS = ["#8A4A2A", "#7A3F2C", "#A05A37", "#B8612A", "#5A6E3B", "#3E6EA0"];
const DENSITY_OPTIONS: Density[] = ["compact", "regular", "comfy"];
const SEV_STYLE_OPTIONS: SevStyle[] = ["filled", "outline", "glyph"];

export function TweaksPanel() {
  const { tweaks, setTweak, reset, open, setOpen } = useTweaks();
  const dragRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 16, y: 16 });

  useEffect(() => {
    // ⌘. / Ctrl+. toggles the tweaks panel.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={dragRef}
      style={{
        position: "fixed",
        right: offsetRef.current.x,
        bottom: offsetRef.current.y,
        zIndex: 60,
        width: 280,
        maxHeight: "calc(100vh - 32px)",
        display: "flex",
        flexDirection: "column",
        background: "rgba(250,249,247,0.92)",
        color: "var(--ink-2)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        boxShadow: "var(--shadow-2)",
        fontSize: 11.5,
        lineHeight: 1.4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 8px 10px 14px",
        }}
      >
        <strong style={{ fontSize: 12, fontWeight: 600 }}>Tweaks</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={reset}
            title="Reset to defaults"
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--ink-3)",
              padding: "4px 6px",
              fontSize: 10.5,
              borderRadius: 4,
            }}
          >
            Reset
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close tweaks"
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--ink-3)",
              width: 22,
              height: 22,
              borderRadius: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <I.X size={13} />
          </button>
        </div>
      </div>

      <div
        style={{
          padding: "2px 14px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
        }}
      >
        <Section label="Accent">
          <ColorPicker
            value={tweaks.accent}
            options={ACCENT_OPTIONS}
            onChange={(v) => setTweak("accent", v)}
          />
        </Section>

        <Section label="Layout">
          <SegmentedRow
            label="Density"
            value={tweaks.density}
            options={DENSITY_OPTIONS}
            onChange={(v) => setTweak("density", v)}
          />
          <ToggleRow
            label="Sidebar labels"
            value={tweaks.sidebarLabels}
            onChange={(v) => setTweak("sidebarLabels", v)}
          />
        </Section>

        <Section label="Severity icons">
          <SegmentedRow
            label="Style"
            value={tweaks.sevStyle}
            options={SEV_STYLE_OPTIONS}
            onChange={(v) => setTweak("sevStyle", v)}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.06 * 16,
          textTransform: "uppercase",
          color: "rgba(41,38,27,.45)",
          paddingTop: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <span style={{ color: "rgba(41,38,27,.72)" }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          position: "relative",
          width: 32,
          height: 18,
          border: 0,
          borderRadius: 999,
          background: value ? "#34c759" : "rgba(0,0,0,.15)",
          transition: "background 150ms",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <i
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,.25)",
            transform: value ? "translateX(14px)" : "translateX(0)",
            transition: "transform 150ms",
          }}
        />
      </button>
    </div>
  );
}

function SegmentedRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  const idx = options.indexOf(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ color: "rgba(41,38,27,.72)" }}>{label}</div>
      <div
        role="radiogroup"
        style={{
          position: "relative",
          display: "flex",
          padding: 2,
          borderRadius: 8,
          background: "rgba(0,0,0,.06)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 2,
            bottom: 2,
            left: `calc(2px + ${idx} * (100% - 4px) / ${options.length})`,
            width: `calc((100% - 4px) / ${options.length})`,
            borderRadius: 6,
            background: "rgba(255,255,255,.9)",
            boxShadow: "0 1px 2px rgba(0,0,0,.12)",
            transition: "left 150ms cubic-bezier(.3,.7,.4,1)",
          }}
        />
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            onClick={() => onChange(o)}
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              border: 0,
              background: "transparent",
              fontWeight: 500,
              padding: "4px 6px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 11,
              color: "inherit",
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((c) => {
        const on = c.toLowerCase() === value.toLowerCase();
        const light = isLightHex(c);
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            aria-label={c}
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              height: 32,
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
              boxShadow: on
                ? "0 0 0 1.5px rgba(0,0,0,.85), 0 2px 6px rgba(0,0,0,.15)"
                : "0 0 0 .5px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.06)",
              background: c,
              transition: "transform 120ms, box-shadow 120ms",
            }}
          >
            {on && (
              <svg
                viewBox="0 0 14 14"
                width="13"
                height="13"
                style={{ position: "absolute", top: 6, left: 6 }}
              >
                <path
                  d="M3 7.2 5.8 10 11 4.2"
                  fill="none"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  stroke={light ? "rgba(0,0,0,.78)" : "#fff"}
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
