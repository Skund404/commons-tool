import type { PaneId } from "@/nav";
import { PaneDashboard } from "@/panes/dashboard";
import { PaneBrowser } from "@/panes/browser";
import { PaneEditor } from "@/panes/editor";
import { PaneBundle } from "@/panes/bundle";
import { PaneTaxonomy } from "@/panes/taxonomy";
import { PaneIndex } from "@/panes/indexes";
import { PanePublish } from "@/panes/publish";
import { PaneFederation } from "@/panes/federation";
import { PaneReview } from "@/panes/review";
import { PaneSettings } from "@/panes/settings";

export interface PaneArgs {
  slug?: string;
  fresh?: boolean;
  fork?: string;
  prId?: number;
}

interface PaneSwitchProps {
  pane: PaneId;
  paneState: Partial<Record<PaneId, PaneArgs>>;
  go: (id: PaneId, args?: PaneArgs) => void;
}

export function PaneSwitch({ pane, paneState, go }: PaneSwitchProps) {
  switch (pane) {
    case "dashboard":
      return <PaneDashboard go={go} />;
    case "browser":
      return <PaneBrowser go={go} />;
    case "editor": {
      const args = paneState.editor ?? {};
      return (
        <PaneEditor
          slug={args.slug}
          fresh={args.fresh}
          fork={args.fork}
          onFork={(id) => go("editor", { fork: id })}
          onDelete={() => go("browser")}
        />
      );
    }
    case "bundle":
      return <PaneBundle />;
    case "taxonomy":
      return <PaneTaxonomy />;
    case "index":
      return <PaneIndex />;
    case "publish":
      return <PanePublish />;
    case "federation":
      return <PaneFederation />;
    case "review":
      return <PaneReview initialPrId={paneState.review?.prId} />;
    case "settings":
      return <PaneSettings />;
    default:
      return <PaneDashboard go={go} />;
  }
}
