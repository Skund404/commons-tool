import { useEffect, useState } from "react";
import { TweaksProvider, TweaksPanel, useTweaks } from "@/components";
import { NAV, type PaneId } from "@/nav";
import { TitleBar } from "@/shell/title-bar";
import { Sidebar } from "@/shell/sidebar";
import { StatusBar } from "@/shell/status-bar";
import { PaneSwitch, type PaneArgs } from "@/shell/pane-switch";
import { OnboardingWizard } from "@/onboarding/wizard";

export default function App() {
  return (
    <TweaksProvider>
      <Shell />
    </TweaksProvider>
  );
}

function Shell() {
  const { tweaks } = useTweaks();
  const [pane, setPane] = useState<PaneId>("dashboard");
  const [paneState, setPaneState] = useState<Partial<Record<PaneId, PaneArgs>>>({});
  const [onboarding, setOnboarding] = useState(() => {
    try {
      return !localStorage.getItem("cm.onboarded");
    } catch {
      return true;
    }
  });

  // Allow Settings → "Re-run onboarding" (and other places) to re-trigger.
  useEffect(() => {
    interface WindowWithOnboarding extends Window {
      __openOnboarding?: () => void;
    }
    const w = window as WindowWithOnboarding;
    w.__openOnboarding = () => setOnboarding(true);
    return () => {
      delete w.__openOnboarding;
    };
  }, []);

  const closeOnboarding = () => {
    try {
      localStorage.setItem("cm.onboarded", "1");
    } catch {
      // ignore
    }
    setOnboarding(false);
  };

  // Hotkeys: ⌘1–9 / Ctrl+1–9 jump between panes; ⌘, opens Settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const idx = "123456789".indexOf(e.key);
      if (idx >= 0 && NAV[idx]) {
        e.preventDefault();
        setPane(NAV[idx].id);
      }
      if (e.key === ",") {
        e.preventDefault();
        setPane("settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (id: PaneId, args: PaneArgs = {}) => {
    setPane(id);
    setPaneState((prev) => ({ ...prev, [id]: args }));
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      <TitleBar />
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `${tweaks.sidebarLabels ? 188 : 56}px 1fr`,
          minHeight: 0,
        }}
      >
        <Sidebar labels={tweaks.sidebarLabels} pane={pane} setPane={(id) => go(id, {})} />
        <main
          style={{
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <PaneSwitch pane={pane} paneState={paneState} go={go} />
        </main>
      </div>
      <StatusBar />

      <OnboardingWizard open={onboarding} onClose={closeOnboarding} />
      <TweaksPanel />
    </div>
  );
}
