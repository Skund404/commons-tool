import { useEffect, useState, Fragment, type ReactNode } from "react";
import { Button, Card, I, Input, Segmented, SeverityDot } from "@/components";

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

interface OnbData {
  repoPath: string;
  repoRemote: string;
  emitterMode: "generate" | "import";
  emitterUri: string;
  keypair: string;
  ghAuth: "checking" | "ok" | "missing";
  vault: string;
}

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "identity", label: "Identity" },
  { id: "github", label: "GitHub" },
  { id: "vault", label: "Vault" },
  { id: "confirm", label: "Confirm" },
] as const;

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnbData>({
    repoPath: "~/code/Skund404/proto-commons",
    repoRemote: "github.com/Skund404/proto-commons",
    emitterMode: "generate",
    emitterUri: "opg://5f3a7b1d-c4ee-aa01-bbf2-3c2a1d8e7f4c",
    keypair: "Ed25519",
    ghAuth: "checking",
    vault: "F:\\Rillmark",
  });

  // Simulate `gh auth status` when entering step 2.
  useEffect(() => {
    if (!open) return;
    if (step === 2 && data.ghAuth === "checking") {
      const t = setTimeout(() => setData((d) => ({ ...d, ghAuth: "ok" })), 1100);
      return () => clearTimeout(t);
    }
  }, [open, step, data.ghAuth]);

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  if (!open) return null;

  const next = () => (step === STEPS.length - 1 ? onClose() : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const setD = (patch: Partial<OnbData>) => setData((d) => ({ ...d, ...patch }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31,27,23,0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
      }}
    >
      <div
        style={{
          width: 640,
          maxWidth: "94vw",
          height: 560,
          maxHeight: "94vh",
          background: "var(--surface)",
          borderRadius: 10,
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px 10px",
            borderBottom: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <OnbLogo />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  Welcome to Commons Maintainer
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                  First-run setup · {step + 1} of {STEPS.length}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: 0,
                cursor: "pointer",
                color: "var(--ink-3)",
                padding: 4,
                display: "inline-flex",
              }}
            >
              <I.X size={16} />
            </button>
          </div>
          <Steps step={step} setStep={setStep} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {step === 0 && <OnbWelcome />}
          {step === 1 && <OnbIdentity data={data} setD={setD} />}
          {step === 2 && <OnbGithub data={data} setD={setD} />}
          {step === 3 && <OnbVault data={data} setD={setD} />}
          {step === 4 && <OnbConfirm data={data} />}
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button variant="ghost" onClick={onClose}>
            Skip for now
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <Button variant="default" onClick={back} icon={<I.ChevLeft size={13} />}>
                Back
              </Button>
            )}
            <Button
              variant={step === STEPS.length - 1 ? "approve" : "primary"}
              icon={step === STEPS.length - 1 ? <I.Check size={13} /> : <I.ChevRight size={13} />}
              onClick={next}
            >
              {step === STEPS.length - 1 ? "Finish setup" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Steps({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 0, marginTop: 14 }}>
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <Fragment key={s.id}>
            <button
              onClick={() => i <= step && setStep(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: 0,
                padding: 0,
                cursor: i <= step ? "pointer" : "default",
                opacity: i > step ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: done ? "var(--sev-approve)" : active ? "var(--accent)" : "var(--surface-2)",
                  color: done || active ? "#fff" : "var(--ink-3)",
                  border: `1.5px solid ${done ? "var(--sev-approve)" : active ? "var(--accent)" : "var(--line-2)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {done ? <I.Check size={10} stroke={3} /> : i + 1}
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--accent)" : done ? "var(--ink-2)" : "var(--ink-3)",
                }}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  alignSelf: "center",
                  margin: "0 8px",
                  background: done ? "var(--sev-approve)" : "var(--line)",
                }}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function OnbLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 22 22" aria-hidden>
      <rect x="2" y="2" width="18" height="18" rx="3" fill="var(--accent)" />
      <path d="M7 7h8v3a5 5 0 0 1-5 5H7Z" fill="rgba(255,255,255,0.92)" />
      <rect x="9" y="11" width="2.4" height="4" fill="var(--accent)" />
    </svg>
  );
}

function OnbWelcome() {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
        Maintain a federated commons of know-how.
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: "var(--ink-2)",
          lineHeight: 1.6,
          marginBottom: 18,
          maxWidth: 460,
        }}
      >
        This tool runs locally and edits a content-addressed graph of tools, materials,
        techniques, and workflows. It pushes to GitHub. It validates contributions before they
        merge. It never phones home.
      </div>
      <Card title="What we'll set up" padded>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--ink-2)",
          }}
        >
          <li>Where to clone the commons repository</li>
          <li>
            An <b>emitter UUID</b> + Ed25519 keypair that signs your contributions
          </li>
          <li>Authentication with the GitHub CLI for PR operations</li>
          <li>Optional vault path for community suggestions</li>
        </ul>
      </Card>
      <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--ink-3)" }}>
        Takes about a minute. You can revisit any of these in Settings.
      </div>
    </div>
  );
}

function OnbIdentity({ data, setD }: { data: OnbData; setD: (p: Partial<OnbData>) => void }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
        Your maintainer identity
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 14 }}>
        Every primitive you originate carries this <span className="mono">emitter</span> URI and
        is signed by your keypair.
      </div>

      <Segmented
        value={data.emitterMode}
        onChange={(v) => setD({ emitterMode: v })}
        options={[
          { value: "generate", label: "Generate new" },
          { value: "import", label: "Import from HideSync" },
        ]}
      />

      {data.emitterMode === "generate" ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <FieldRow
            label="Emitter URI"
            hint="A unique installation identifier — saved locally; never sent over the network."
          >
            <div style={{ display: "flex", gap: 6 }}>
              <Input
                value={data.emitterUri}
                onChange={(e) => setD({ emitterUri: e.target.value })}
                leadingIcon={<I.Tag size={12} />}
                style={{ flex: 1 }}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={<I.Refresh size={11} />}
                onClick={() => setD({ emitterUri: "opg://" + makeUuid() })}
              >
                Regenerate
              </Button>
            </div>
          </FieldRow>
          <FieldRow
            label="Keypair"
            hint="Signs commits and content hashes. Stored in your OS keychain."
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: 5,
                fontSize: 12.5,
              }}
            >
              <span>
                <b>{data.keypair}</b> · SHA256:8f4e…2c91
              </span>
              <Button variant="ghost" size="sm">
                Reveal
              </Button>
            </div>
          </FieldRow>
        </div>
      ) : (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            background: "var(--sev-info-soft)",
            border: "1px solid rgba(62,110,160,0.2)",
            borderRadius: 5,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SeverityDot sev="info" />
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              Import an existing identity from a HideSync export file.
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<I.Upload size={12} />}
            style={{ alignSelf: "flex-start" }}
          >
            Choose HideSync export…
          </Button>
        </div>
      )}
    </div>
  );
}

function OnbGithub({ data, setD }: { data: OnbData; setD: (p: Partial<OnbData>) => void }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Repository & GitHub</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 14 }}>
        The commons lives in a git repository. Pull requests and review actions go through the
        GitHub CLI.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <FieldRow label="Local clone path">
          <div style={{ display: "flex", gap: 6 }}>
            <Input
              value={data.repoPath}
              onChange={(e) => setD({ repoPath: e.target.value })}
              leadingIcon={<I.Branch size={12} />}
              style={{ flex: 1 }}
            />
            <Button variant="default" size="sm">
              Choose…
            </Button>
          </div>
        </FieldRow>
        <FieldRow label="GitHub remote">
          <Input
            value={data.repoRemote}
            onChange={(e) => setD({ repoRemote: e.target.value })}
            leadingIcon={<I.Globe size={12} />}
          />
        </FieldRow>
        <FieldRow
          label="`gh` CLI authentication"
          hint="Required for opening, reviewing, and merging PRs."
        >
          <GhAuthStatus
            state={data.ghAuth}
            onRecheck={() => setD({ ghAuth: "checking" })}
          />
        </FieldRow>
      </div>
    </div>
  );
}

function GhAuthStatus({
  state,
  onRecheck,
}: {
  state: OnbData["ghAuth"];
  onRecheck: () => void;
}) {
  if (state === "checking") {
    return (
      <div
        style={{
          padding: "8px 10px",
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 5,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12.5,
          color: "var(--ink-3)",
        }}
      >
        <span className="skel" style={{ width: 16, height: 8 }} />
        Checking <span className="mono">gh auth status</span>…
      </div>
    );
  }
  if (state === "ok") {
    return (
      <div
        style={{
          padding: "8px 10px",
          background: "var(--sev-approve-soft)",
          border: "1px solid rgba(90,122,59,0.2)",
          borderRadius: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 12.5,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "var(--sev-approve)",
          }}
        >
          <SeverityDot sev="approve" /> Authenticated as <b>@rillmark</b>
        </span>
        <Button variant="ghost" size="sm" onClick={onRecheck} icon={<I.Refresh size={11} />}>
          Re-check
        </Button>
      </div>
    );
  }
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--sev-reject-soft)",
        border: "1px solid rgba(178,58,44,0.2)",
        borderRadius: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 12.5,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          color: "var(--sev-reject)",
        }}
      >
        <SeverityDot sev="reject" /> Not authenticated
      </span>
      <Button variant="default" size="sm">
        Run `gh auth login`
      </Button>
    </div>
  );
}

function OnbVault({ data, setD }: { data: OnbData; setD: (p: Partial<OnbData>) => void }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Vault (optional)</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 14 }}>
        Point this at a folder where you save markdown notes from Discord, Reddit, or email.
        The tool surfaces them in the Suggestions queue so you can triage them into formal
        primitives.
      </div>
      <FieldRow label="Vault path">
        <div style={{ display: "flex", gap: 6 }}>
          <Input
            value={data.vault}
            onChange={(e) => setD({ vault: e.target.value })}
            leadingIcon={<I.File size={12} />}
            style={{ flex: 1 }}
          />
          <Button variant="default" size="sm">
            Choose…
          </Button>
        </div>
      </FieldRow>
      <div
        style={{
          marginTop: 14,
          padding: 12,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 5,
          fontSize: 12,
          color: "var(--ink-3)",
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <SeverityDot sev="info" />
        <div>
          You can skip this. Suggestions will appear in the dashboard queue any time a watched
          folder gets new markdown files.
        </div>
      </div>
    </div>
  );
}

function OnbConfirm({ data }: { data: OnbData }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>You're set up.</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 14 }}>
        Review the configuration below, then finish to land on the dashboard.
      </div>
      <Card padded={false}>
        <SumRow label="Repository">
          <span className="mono" style={{ fontSize: 12 }}>
            {data.repoRemote}
          </span>
        </SumRow>
        <SumRow label="Local clone">
          <span className="mono" style={{ fontSize: 12 }}>
            {data.repoPath}
          </span>
        </SumRow>
        <SumRow label="Emitter">
          <span className="mono" style={{ fontSize: 12 }}>
            {data.emitterUri}
          </span>
        </SumRow>
        <SumRow label="Keypair">{data.keypair} · SHA256:8f4e…2c91</SumRow>
        <SumRow label="gh auth">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--sev-approve)",
            }}
          >
            <SeverityDot sev="approve" /> Authenticated
          </span>
        </SumRow>
        <SumRow label="Vault">
          <span className="mono" style={{ fontSize: 12 }}>
            {data.vault || <span style={{ color: "var(--ink-4)" }}>none</span>}
          </span>
        </SumRow>
      </Card>
    </div>
  );
}

function SumRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 10,
        padding: "8px 14px",
        borderTop: "1px solid var(--line)",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--ink-2)", fontSize: 12.5 }}>{children}</span>
    </div>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink-2)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function makeUuid(): string {
  const h = "0123456789abcdef";
  const r = (n: number) => Array.from({ length: n }, () => h[Math.floor(Math.random() * 16)]).join("");
  return `${r(8)}-${r(4)}-${r(4)}-${r(4)}-${r(12)}`;
}
