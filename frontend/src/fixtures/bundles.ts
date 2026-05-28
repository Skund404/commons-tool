import type { Bundle } from "@/types/primitives";
import { PASCAL_EMITTER_URI } from "./primitives";

export const BUNDLES: Bundle[] = [
  {
    id: "edge-finishing-kit",
    slug: "edge-finishing-kit",
    hash: "sha256:b002b002b002b002b002b002b002b002b002b002b002b002b002b002b002b002",
    emitter: PASCAL_EMITTER_URI,
    license: "CC-BY-4.0",
    state: "published",
    names: {
      en: {
        name: "Edge Finishing Kit",
        desc: "Tools and materials to burnish and seal a leather edge.",
      },
      de: {
        name: "Kantenfinish-Set",
        desc: "Werkzeuge und Material zum Polieren der Lederkante.",
      },
      fr: {
        name: "Kit de finition des tranches",
        desc: "Outils et matières pour polir une tranche de cuir.",
      },
    },
    items: [
      { kind: "tool", slug: "edge-slicker", role: "required" },
      { kind: "material", slug: "beeswax", role: "required" },
      { kind: "technique", slug: "edge-burnishing", role: "required" },
    ],
  },
  {
    id: "saddle-stitch-essentials",
    slug: "saddle-stitch-essentials",
    hash: "sha256:b001b001b001b001b001b001b001b001b001b001b001b001b001b001b001b001",
    emitter: PASCAL_EMITTER_URI,
    license: "CC-BY-4.0",
    state: "published",
    names: {
      en: {
        name: "Saddle Stitch Essentials",
        desc: "The minimum kit to hand-stitch leather using the saddle stitch.",
      },
      de: {
        name: "Sattlernaht – Grundausstattung",
        desc: "Das Minimalset für die Sattlernaht.",
      },
      fr: {
        name: "Couture sellier — l'essentiel",
        desc: "Le kit minimum pour la couture sellier.",
      },
    },
    items: [
      { kind: "tool", slug: "mallet", role: "required" },
      { kind: "tool", slug: "diamond-awl", role: "required" },
      { kind: "material", slug: "waxed-thread", role: "required" },
      { kind: "technique", slug: "saddle-stitch", role: "required" },
      { kind: "material", slug: "veg-tan", role: "recommended" },
      // Nested bundle: a bundle can contain another bundle.
      { kind: "bundle", slug: "edge-finishing-kit", role: "recommended" },
    ],
  },
];
