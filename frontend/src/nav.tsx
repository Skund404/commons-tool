import { I, type IconProps } from "@/components/icons";

export type PaneId =
  | "dashboard"
  | "browser"
  | "editor"
  | "intake"
  | "bundle"
  | "taxonomy"
  | "index"
  | "publish"
  | "federation"
  | "review"
  | "settings";

export interface NavEntry {
  id: PaneId;
  label: string;
  icon: React.ComponentType<IconProps>;
  hint: string;
}

export const NAV: NavEntry[] = [
  { id: "dashboard", label: "Dashboard", icon: I.Home, hint: "⌘1" },
  { id: "browser", label: "Browse", icon: I.Search, hint: "⌘2" },
  { id: "editor", label: "Editor", icon: I.EditPen, hint: "⌘3" },
  { id: "intake", label: "Intake", icon: I.Upload, hint: "⌘4" },
  { id: "bundle", label: "Bundles", icon: I.Bundle, hint: "⌘5" },
  { id: "taxonomy", label: "Taxonomy", icon: I.Tree, hint: "⌘6" },
  { id: "index", label: "Indexes", icon: I.Index, hint: "⌘7" },
  { id: "publish", label: "Publish", icon: I.Upload, hint: "⌘8" },
  { id: "federation", label: "Federation", icon: I.Globe, hint: "⌘9" },
  { id: "review", label: "Review", icon: I.GitPullReq, hint: "⌘0" },
  { id: "settings", label: "Settings", icon: I.Gear, hint: "⌘," },
];
