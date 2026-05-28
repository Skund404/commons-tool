import type { Commit, LocalChange, Suggestion } from "@/types/primitives";

export const LOCAL_CHANGES: LocalChange[] = [
  {
    op: "+",
    path: "primitives/tools/french-skiver.json",
    state: "validated",
    slug: "french-skiver",
    kind: "tool",
  },
  {
    op: "M",
    path: "primitives/techniques/skiving.json",
    state: "draft",
    slug: "skiving",
    kind: "technique",
  },
  {
    op: "M",
    path: "bundles/saddle-stitch-essentials.json",
    state: "validated",
    slug: "saddle-stitch-essentials",
    kind: "bundle",
  },
  { op: "M", path: "indexes/resolve/en.json", state: "regen", slug: "—", kind: "index" },
  { op: "M", path: "indexes/resolve/de.json", state: "regen", slug: "—", kind: "index" },
  { op: "M", path: "indexes/taxonomy/en.json", state: "regen", slug: "—", kind: "index" },
];

export const SUGGESTIONS: Suggestion[] = [
  {
    id: "sg-031",
    title: "Add bone folder",
    source: "Discord #beginners",
    captured: "3h ago",
    status: "open",
    lang: "en",
    body: "User asked about bone folders for edge creasing — we have no primitive yet.",
  },
  {
    id: "sg-030",
    title: "French skiver",
    source: "Reddit /r/leathercraft",
    captured: "1d ago",
    status: "authoring",
    lang: "en",
    body: "Long thread on French skivers vs Japanese skivers. Maintainer is drafting.",
  },
  {
    id: "sg-029",
    title: "Aniline dye terminology",
    source: "Discord #materials",
    captured: "2d ago",
    status: "open",
    lang: "en",
    body: "Conflict between EU/US naming for aniline vs semi-aniline.",
  },
  {
    id: "sg-028",
    title: "Pricking iron sizes (mm vs SPI)",
    source: "Email",
    captured: "4d ago",
    status: "open",
    lang: "en",
    body: "Sizing convention question.",
  },
];

export const COMMITS: Commit[] = [
  {
    sha: "a7f4c2e",
    author: "pascal",
    time: "today, 09:12",
    msg: "Validate vegetable-tan & burnishing relationships",
  },
  {
    sha: "3b1d92a",
    author: "pascal",
    time: "yesterday",
    msg: "Add Osborne diamond awl as instance of diamond-awl",
  },
  {
    sha: "c81e72b",
    author: "ortega-leather",
    time: "2 days ago",
    msg: "Localize saddle-stitch into fr (canonical + alias)",
  },
  {
    sha: "94aa113",
    author: "pascal",
    time: "3 days ago",
    msg: "Regenerate resolve indexes; rebuild taxonomy tree for en/de",
  },
  {
    sha: "1f02c5e",
    author: "drwilbert",
    time: "4 days ago",
    msg: "Add edge-slicker primitive with material relationships",
  },
];
