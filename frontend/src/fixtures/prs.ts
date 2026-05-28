import type { PullRequest } from "@/types/primitives";

export const PRS: PullRequest[] = [
  {
    id: 12,
    title: "Add scratch awl",
    author: "somemaker",
    authorMeta: "first-time contributor",
    age: "2 hours ago",
    branch: "contrib/scratch-awl",
    files: [
      { op: "+", path: "primitives/tools/scratch-awl.json", added: 38, removed: 0 },
      { op: "M", path: "indexes/resolve/en.json", added: 2, removed: 0 },
      { op: "M", path: "indexes/resolve/de.json", added: 2, removed: 0 },
    ],
    semantic: [
      "New tool primitive: scratch-awl",
      "Resolve indexes will regenerate cleanly",
      "Specializes existing primitive `awl`",
    ],
    recs: [
      {
        sev: "approve",
        title: "Schema validates",
        body: "JSON schema v3 for primitive/tool passes. All required fields present.",
        file: "primitives/tools/scratch-awl.json",
      },
      {
        sev: "approve",
        title: "Hash integrity OK",
        body: "Computed hash matches manifest. Content-addressed payload verified.",
        file: "primitives/tools/scratch-awl.json",
        hash: "sha256:9b3c…f0a4",
      },
      {
        sev: "approve",
        title: "License = CC-BY-4.0",
        body: "License field present and matches commons policy.",
      },
      {
        sev: "warn",
        title: '"awl" alias collides with existing primitive',
        body: 'Alias "awl" already resolves to the existing `awl` primitive. Users will see disambiguation on search results in en, de.',
        file: "indexes/resolve/en.json",
        suggest: "Either drop the alias, or accept the disambiguation.",
      },
      {
        sev: "info",
        title: 'Adds new emitter "opg://9a3f6b21..." (first seen)',
        body: "This is the first primitive emitted by opg://9a3f6b21-4d8e-c7a0-bb5e-1f2d8a4c6e9b — record will be added to the emitter registry on merge.",
      },
    ],
  },
  {
    id: 11,
    title: "Specialize `edge-slicker` with cocobolo variant",
    author: "ortega-leather",
    authorMeta: "12 prior contributions",
    age: "8 hours ago",
    branch: "contrib/cocobolo-slicker",
    files: [
      { op: "+", path: "primitives/tools/cocobolo-slicker.json", added: 32, removed: 0 },
      { op: "M", path: "indexes/taxonomy/en.json", added: 4, removed: 0 },
    ],
    semantic: [
      "New tool primitive: cocobolo-slicker, specializes edge-slicker",
      "Taxonomy depth increases to 3 under tool > finishing",
    ],
    recs: [
      { sev: "approve", title: "Schema validates" },
      { sev: "approve", title: "Hash integrity OK" },
      {
        sev: "info",
        title: "Bundle cascade: 0 affected",
        body: "No published bundles reference edge-slicker subtree.",
      },
    ],
  },
  {
    id: 10,
    title: "Add `pinking-shears` technique (mis-classified)",
    author: "drwilbert",
    authorMeta: "3 prior contributions",
    age: "1 day ago",
    branch: "contrib/pinking-shears",
    files: [{ op: "+", path: "primitives/techniques/pinking-shears.json", added: 41, removed: 0 }],
    semantic: [
      "New technique primitive: pinking-shears",
      "Cross-domain primitive (textiles), kind mismatch suspected",
    ],
    recs: [
      {
        sev: "reject",
        title: "Kind mismatch: should be `tool`, not `technique`",
        body: "`pinking-shears` describes a physical instrument with manufacturer and category fields, but kind is `technique`. Schema validates by accident because both kinds share a base shape. Reclassify as kind=tool, or split into shears (tool) + pinking (technique).",
        file: "primitives/techniques/pinking-shears.json",
        suggest: "Change kind to `tool` and move file to primitives/tools/",
      },
      {
        sev: "warn",
        title: "Outside primary craft domain",
        body: "Primary commons is leatherworking. `pinking-shears` is textile. Consider routing to bindery-adjacent federation or a textiles root.",
        file: "primitives/techniques/pinking-shears.json",
      },
      { sev: "approve", title: "License = CC-BY-4.0" },
    ],
  },
];
