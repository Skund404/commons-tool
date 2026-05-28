import type { FederationRoot } from "@/types/primitives";

export const FED_ROOTS: FederationRoot[] = [
  {
    id: "rillmark-primary",
    name: "Rillmark (primary)",
    url: "github.com/Skund404/proto-commons",
    role: "primary",
    lastSync: "now",
    primCount: 184,
    language: ["en", "de", "fr"],
  },
  {
    id: "leatherworker-de",
    name: "Leatherworker Collective DE",
    url: "github.com/lw-de/commons",
    role: "read",
    lastSync: "2h ago",
    primCount: 47,
    language: ["de"],
  },
  {
    id: "bindery-commons",
    name: "Bindery Commons",
    url: "github.com/bindery/commons",
    role: "read",
    lastSync: "1d ago",
    primCount: 122,
    language: ["en", "fr", "ja"],
    craft: "bookbinding",
  },
];
