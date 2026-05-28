// Hex color helpers — port from prototype's app.jsx.
// Used by the tweaks panel to derive accent-2 + accent-soft from a chosen accent.

function hexToRgb(h: string): [number, number, number] {
  const m = h.replace("#", "").match(/.{2}/g) ?? ["00", "00", "00"];
  const [r, g, b] = m.map((x) => parseInt(x, 16));
  return [r ?? 0, g ?? 0, b ?? 0];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, x | 0));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexShift(h: string, amt: number): string {
  const [r, g, b] = hexToRgb(h);
  return rgbToHex(r + amt, g + amt, b + amt);
}

// Mix a hex color toward the warm background (--bg #F7F5F1) at 18% strength.
export function hexToSoft(h: string): string {
  const [r, g, b] = hexToRgb(h);
  const bgR = 247,
    bgG = 245,
    bgB = 241;
  const a = 0.18;
  return rgbToHex(r * a + bgR * (1 - a), g * a + bgG * (1 - a), b * a + bgB * (1 - a));
}

// Relative-luminance contrast check — for deciding white vs. dark glyph on a swatch.
export function isLightHex(h: string): boolean {
  const x = h.replace("#", "");
  const padded = x.length === 3 ? x.replace(/./g, (c) => c + c) : x.padEnd(6, "0");
  const n = parseInt(padded.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
