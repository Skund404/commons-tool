// Centralized icon set. Wraps lucide-react with consistent defaults
// (size 16, stroke 1.6) so usage stays uniform across panes.
//
// The prototype's `I.<Name>` object maps to lucide equivalents here. Where
// lucide doesn't have a clean match, we keep a custom SVG inline.

import {
  AlertTriangle,
  AlignJustify,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Copy,
  Eye,
  ExternalLink,
  File,
  FileEdit,
  FilePlus,
  Filter,
  Folder,
  GitBranch,
  GitCommit,
  GitFork,
  GitPullRequest,
  Globe,
  GripVertical,
  Home,
  Info,
  Languages,
  Layers,
  Link as LinkIcon,
  List,
  LayoutGrid,
  Minus,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Tag,
  TrendingUp,
  Trash2,
  Upload,
  User,
  Workflow,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

export interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}

// Wrap a lucide icon with the project's defaults.
function wrap(Comp: LucideIcon) {
  const Wrapped = ({ size = 16, stroke = 1.6, className, style }: IconProps) => (
    <Comp
      size={size}
      strokeWidth={stroke}
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
  Wrapped.displayName = Comp.displayName ?? "Icon";
  return Wrapped;
}

// Filled dot used for indicators.
const Dot = ({ size = 16, className, style }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
  </svg>
);

// Tree glyph (prototype's hand-drawn version). Used for taxonomy nav.
const Tree = ({ size = 16, stroke = 1.6, className, style }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="12" r="2" />
    <path d="M8 6h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8" />
    <path d="M14 12h2" />
  </svg>
);

// Index glyph (list with leading dots).
const Index = ({ size = 16, stroke = 1.6, className, style }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path d="M4 5h16" />
    <path d="M4 12h16" />
    <path d="M4 19h16" />
    <circle cx="7" cy="5" r="0.6" fill="currentColor" />
    <circle cx="7" cy="12" r="0.6" fill="currentColor" />
    <circle cx="7" cy="19" r="0.6" fill="currentColor" />
  </svg>
);

export const I = {
  // Navigation
  Home: wrap(Home),
  Search: wrap(Search),
  EditPen: wrap(Pencil),
  Bundle: wrap(Layers),
  Tree,
  Index,
  Upload: wrap(Upload),
  Globe: wrap(Globe),
  GitPullReq: wrap(GitPullRequest),
  Gear: wrap(Settings),

  // Kinds
  Tool: wrap(Wrench),
  Material: wrap(Package),
  Technique: wrap(TrendingUp),
  Workflow: wrap(Workflow),
  Project: wrap(Folder),
  Event: wrap(Clock),

  // Severity
  Check: wrap(Check),
  X: wrap(X),
  Warn: wrap(AlertTriangle),
  Info: wrap(Info),

  // UI
  ChevDown: wrap(ChevronDown),
  ChevRight: wrap(ChevronRight),
  ChevLeft: wrap(ChevronLeft),
  ChevUp: wrap(ChevronUp),
  Plus: wrap(Plus),
  Minus: wrap(Minus),
  Copy: wrap(Copy),
  Filter: wrap(Filter),
  Grid: wrap(LayoutGrid),
  List: wrap(List),
  Refresh: wrap(RefreshCw),
  ArrowRight: wrap(ArrowRight),
  Dot,
  Branch: wrap(GitBranch),
  GitCommit: wrap(GitCommit),
  Fork: wrap(GitFork),
  File: wrap(File),
  FilePlus: wrap(FilePlus),
  FilePencil: wrap(FileEdit),
  Link: wrap(LinkIcon),
  Lang: wrap(Languages),
  Tag: wrap(Tag),
  User: wrap(User),
  Drag: wrap(GripVertical),
  Clock: wrap(Clock),
  Trash: wrap(Trash2),
  Eye: wrap(Eye),
  Send: wrap(Send),
  Sparkle: wrap(Sparkles),
  ExternalLink: wrap(ExternalLink),
  AlignJustify: wrap(AlignJustify),
  Circle: wrap(Circle),
} as const;

export type IconKey = keyof typeof I;
