import { I } from "./icons";

export const KIND_ICON = {
  tool: I.Tool,
  material: I.Material,
  technique: I.Technique,
  workflow: I.Workflow,
  project: I.Project,
  event: I.Event,
  bundle: I.Bundle,
  index: I.Index,
} as const;

export const KIND_LABEL: Record<string, string> = {
  tool: "Tool",
  material: "Material",
  technique: "Technique",
  workflow: "Workflow",
  project: "Project",
  event: "Event",
  bundle: "Bundle",
  index: "Index",
};

export type KindKey = keyof typeof KIND_ICON;

interface KindGlyphProps {
  kind: KindKey | string;
  size?: number;
}

export function KindGlyph({ kind, size = 18 }: KindGlyphProps) {
  const Ico = KIND_ICON[kind as KindKey] ?? I.File;
  const px = size + 8;
  return (
    <span
      title={KIND_LABEL[kind] ?? kind}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: px,
        height: px,
        borderRadius: 4,
        background: "var(--surface-2)",
        color: "var(--ink-2)",
        border: "1px solid var(--line)",
        flex: "none",
      }}
    >
      <Ico size={size - 2} stroke={1.6} />
    </span>
  );
}
