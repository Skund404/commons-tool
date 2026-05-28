import { useState, type ReactNode } from "react";
import {
  Button,
  Card,
  I,
  Input,
  LangBadge,
  Segmented,
  SeverityDot,
  Toolbar,
} from "@/components";
import { PASCAL_EMITTER_URI } from "@/fixtures";
import { useFederationRoots } from "@/api/hooks";

type SettingSec = "identity" | "repo" | "vault" | "federation" | "lang" | "about";

const SECS: { id: SettingSec; label: string; icon: ReactNode }[] = [
  { id: "identity", label: "Identity", icon: <I.User size={13} /> },
  { id: "repo", label: "Repository", icon: <I.Branch size={13} /> },
  { id: "vault", label: "Vault", icon: <I.File size={13} /> },
  { id: "federation", label: "Federation", icon: <I.Globe size={13} /> },
  { id: "lang", label: "Languages", icon: <I.Lang size={13} /> },
  { id: "about", label: "About", icon: <I.Info size={13} /> },
];

export function PaneSettings() {
  const [sec, setSec] = useState<SettingSec>("identity");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Gear size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Settings</span>
          </>
        }
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "200px 1fr", minHeight: 0 }}>
        <div
          style={{
            borderRight: "1px solid var(--line)",
            background: "var(--surface)",
            padding: "12px 0",
            overflowY: "auto",
          }}
        >
          {SECS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSec(s.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "6px 14px",
                background: sec === s.id ? "var(--surface-2)" : "transparent",
                border: 0,
                borderLeft: sec === s.id ? "2px solid var(--accent)" : "2px solid transparent",
                textAlign: "left",
                fontSize: 12.5,
                cursor: "pointer",
                color: sec === s.id ? "var(--ink)" : "var(--ink-2)",
                fontWeight: sec === s.id ? 600 : 500,
              }}
            >
              <span style={{ color: "var(--ink-3)" }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ overflowY: "auto", padding: 24 }}>
          <div style={{ maxWidth: 640 }}>
            {sec === "identity" && <SettingsIdentity />}
            {sec === "repo" && <SettingsRepo />}
            {sec === "vault" && <SettingsVault />}
            {sec === "federation" && <SettingsFederation />}
            {sec === "lang" && <SettingsLang />}
            {sec === "about" && <SettingsAbout />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        gap: 24,
        padding: "14px 0",
        borderBottom: "1px solid var(--line)",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingsIdentity() {
  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Identity</h2>
      <SettingRow label="Emitter URI" sub="Stamped on every primitive you originate.">
        <div style={{ display: "flex", gap: 6 }}>
          <Input defaultValue={PASCAL_EMITTER_URI} style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon={<I.Copy size={11} />} />
        </div>
      </SettingRow>
      <SettingRow label="Public key fingerprint">
        <Input defaultValue="SHA256:8f4e…2c91" />
      </SettingRow>
      <SettingRow label="Keypair" sub="Used to sign published commits.">
        <Button variant="default" size="sm" icon={<I.Refresh size={11} />}>
          Rotate keypair
        </Button>
      </SettingRow>
      <SettingRow label="Import from HideSync">
        <Button variant="default" size="sm" icon={<I.Upload size={11} />}>
          Import…
        </Button>
      </SettingRow>
    </div>
  );
}

function SettingsRepo() {
  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Repository</h2>
      <SettingRow label="Local clone path">
        <Input defaultValue="~/code/Skund404/proto-commons" />
      </SettingRow>
      <SettingRow label="GitHub remote">
        <Input defaultValue="github.com/Skund404/proto-commons" />
      </SettingRow>
      <SettingRow label="Default branch">
        <Input defaultValue="main" />
      </SettingRow>
      <SettingRow label="GitHub auth (gh CLI)" sub="Required for PR operations.">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--sev-approve)",
          }}
        >
          <SeverityDot sev="approve" /> Authenticated as @rillmark
        </span>
      </SettingRow>
    </div>
  );
}

function SettingsVault() {
  const [watch, setWatch] = useState<"on" | "off">("on");
  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Vault</h2>
      <SettingRow label="Vault path" sub="Where suggestions and informal notes live.">
        <Input defaultValue="F:\\Rillmark" />
      </SettingRow>
      <SettingRow label="Watch for new suggestions">
        <Segmented<"on" | "off">
          value={watch}
          onChange={setWatch}
          options={["on", "off"]}
        />
      </SettingRow>
    </div>
  );
}

function SettingsFederation() {
  const { data: FED_ROOTS = [] } = useFederationRoots();
  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Federation roots</h2>
      <Card padded={false}>
        {FED_ROOTS.map((r, i) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr auto",
              gap: 10,
              alignItems: "center",
              padding: "10px 12px",
              borderTop: i === 0 ? "0" : "1px solid var(--line)",
            }}
          >
            <I.Globe
              size={14}
              style={{ color: r.role === "primary" ? "var(--accent)" : "var(--ink-3)" }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {r.url}
              </div>
            </div>
            {r.role !== "primary" && (
              <Button variant="ghost" size="sm" icon={<I.X size={11} />} />
            )}
          </div>
        ))}
      </Card>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <Button variant="default" size="sm" icon={<I.Plus size={11} />}>
          Add federated root
        </Button>
      </div>
    </div>
  );
}

function SettingsLang() {
  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Authoring languages</h2>
      <SettingRow label="Default tabs in editor" sub="Which language tabs appear by default.">
        <div style={{ display: "flex", gap: 6 }}>
          {["en", "de", "fr", "ja", "it"].map((l) => (
            <LangBadge key={l} lang={l} present={["en", "de", "fr"].includes(l)} />
          ))}
        </div>
      </SettingRow>
      <SettingRow label="UI language" sub="Tool UI is English-only in v1.">
        <Input defaultValue="English" />
      </SettingRow>
    </div>
  );
}

function SettingsAbout() {
  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>About</h2>
      <SettingRow label="Version">
        <span className="mono" style={{ fontSize: 12 }}>
          0.1.0
        </span>
      </SettingRow>
      <SettingRow label="Documentation">
        <Button variant="ghost" size="sm" icon={<I.ExternalLink size={11} />}>
          docs.rillmark.org
        </Button>
      </SettingRow>
      <SettingRow label="Source">
        <Button variant="ghost" size="sm" icon={<I.ExternalLink size={11} />}>
          github.com/Skund404/commons-tool
        </Button>
      </SettingRow>
      <SettingRow
        label="First-run setup"
        sub="Walk through repository, identity, and gh auth again."
      >
        <Button
          variant="default"
          size="sm"
          icon={<I.Refresh size={11} />}
          onClick={() => {
            interface W extends Window {
              __openOnboarding?: () => void;
            }
            (window as W).__openOnboarding?.();
          }}
        >
          Re-run onboarding
        </Button>
      </SettingRow>
    </div>
  );
}
