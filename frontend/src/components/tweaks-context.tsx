import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hexShift, hexToSoft } from "@/lib/hex";

export type Density = "compact" | "regular" | "comfy";
export type SevStyle = "filled" | "outline" | "glyph";

export interface TweakValues {
  accent: string;
  density: Density;
  sidebarLabels: boolean;
  sevStyle: SevStyle;
}

export const TWEAK_DEFAULTS: TweakValues = {
  accent: "#8A4A2A",
  density: "comfy",
  sidebarLabels: true,
  sevStyle: "filled",
};

const STORAGE_KEY = "cm.tweaks";

function loadTweaks(): TweakValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return TWEAK_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<TweakValues>;
    return { ...TWEAK_DEFAULTS, ...parsed };
  } catch {
    return TWEAK_DEFAULTS;
  }
}

function saveTweaks(v: TweakValues) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // ignore quota
  }
}

interface TweaksContextValue {
  tweaks: TweakValues;
  setTweak: <K extends keyof TweakValues>(key: K, value: TweakValues[K]) => void;
  reset: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const TweaksContext = createContext<TweaksContextValue | null>(null);

export function TweaksProvider({ children }: { children: ReactNode }) {
  const [tweaks, setTweaks] = useState<TweakValues>(loadTweaks);
  const [open, setOpen] = useState(false);

  // Apply CSS variable overrides whenever accent or density change.
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--accent", tweaks.accent);
    r.style.setProperty("--accent-2", hexShift(tweaks.accent, 12));
    r.style.setProperty("--accent-soft", hexToSoft(tweaks.accent));
    const dens =
      tweaks.density === "compact" ? 0.85 : tweaks.density === "comfy" ? 1.1 : 1;
    r.style.setProperty("--dens", String(dens));
    saveTweaks(tweaks);
  }, [tweaks]);

  const setTweak = useCallback<TweaksContextValue["setTweak"]>((key, value) => {
    setTweaks((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setTweaks(TWEAK_DEFAULTS), []);

  const value = useMemo<TweaksContextValue>(
    () => ({ tweaks, setTweak, reset, open, setOpen }),
    [tweaks, setTweak, reset, open],
  );

  return <TweaksContext.Provider value={value}>{children}</TweaksContext.Provider>;
}

export function useTweaks(): TweaksContextValue {
  const ctx = useContext(TweaksContext);
  if (!ctx) {
    // Allow components to render outside the provider during tests
    return {
      tweaks: TWEAK_DEFAULTS,
      setTweak: () => undefined,
      reset: () => undefined,
      open: false,
      setOpen: () => undefined,
    };
  }
  return ctx;
}
