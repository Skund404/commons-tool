import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  I,
  KIND_ICON,
  KIND_LABEL,
  SeverityChip,
  SeverityDot,
  SEV,
  StateBadge,
  Toolbar,
} from "@/components";
import { LOCAL_CHANGES } from "@/fixtures";
import type { LocalChange, PrimitiveKind, Severity } from "@/types/primitives";

interface Rec {
  sev: Severity;
  title: string;
  body?: string;
}

const RECS: Rec[] = [
  { sev: "approve", title: "Schema validates for all 2 modified primitives" },
  { sev: "approve", title: "Hash integrity OK across staged set" },
  { sev: "approve", title: "License = CC-BY-4.0 on every changed primitive" },
  {
    sev: "warn",
    title: "Bundle `saddle-stitch-essentials` cascades affect 1 federated mirror",
    body: "Bindery Commons (federated) mirrors this bundle. They will re-pull on next sync.",
  },
  { sev: "info", title: "Indexes will be regenerated for en, de" },
];

interface StepDef {
  id: "stage" | "validate" | "preview" | "publish";
  label: string;
  icon: ReactNode;
}

const STEPS: StepDef[] = [
  { id: "stage", label: "Stage", icon: <I.FilePencil size={13} /> },
  { id: "validate", label: "Validate", icon: <I.Check size={13} /> },
  { id: "preview", label: "Preview", icon: <I.Eye size={13} /> },
  { id: "publish", label: "Publish", icon: <I.Upload size={13} /> },
];

export function PanePublish() {
  const [step, setStep] = useState(0);
  const [include, setInclude] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LOCAL_CHANGES.map((c) => [c.path, true])),
  );
  const [commitMsg, setCommitMsg] = useState(
    "Add French skiver primitive; update skiving technique steps; regen indexes",
  );
  const [published, setPublished] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const includedFiles = LOCAL_CHANGES.filter((c) => include[c.path]);
  const rejectCount = RECS.filter((r) => r.sev === "reject").length;

  const next = () => {
    if (step === 3) {
      runPublishSim();
    } else {
      setStep((s) => Math.min(3, s + 1));
    }
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  function runPublishSim() {
    setPublished(false);
    setLog([]);
    const lines = [
      "$ git add primitives/tools/french-skiver.json primitives/techniques/skiving.json bundles/saddle-stitch-essentials.json indexes/",
      `$ git commit -m "${commitMsg.split("\n")[0]}"`,
      `[main 4f8a1c2] ${commitMsg.split("\n")[0]}`,
      " 6 files changed, 89 insertions(+), 12 deletions(-)",
      " create mode 100644 primitives/tools/french-skiver.json",
      "$ git push origin main",
      "Enumerating objects: 18, done.",
      "Counting objects: 100% (18/18), done.",
      "Delta compression using up to 8 threads",
      "Compressing objects: 100% (10/10), done.",
      "Writing objects: 100% (12/12), 4.21 KiB | 4.21 MiB/s, done.",
      "To github.com:Skund404/proto-commons.git",
      "   a7f4c2e..4f8a1c2  main -> main",
      "✓ Published 3 primitives, 1 bundle, 3 indexes to Skund404/proto-commons",
    ];
    lines.forEach((l, i) =>
      setTimeout(() => {
        setLog((prev) => [...prev, l]);
        if (i === lines.length - 1) setPublished(true);
      }, 120 + i * 130),
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.Upload size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Publish workflow</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · Stage → Validate → Preview → Publish
            </span>
          </>
        }
        right={
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Target:{" "}
            <span className="mono" style={{ color: "var(--ink-2)" }}>
              github.com/Skund404/proto-commons
            </span>{" "}
            · <span className="mono">main</span>
          </span>
        }
      />

      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={s.id}
                onClick={() => i <= step && setStep(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 8px",
                  background: "transparent",
                  border: 0,
                  cursor: i <= step ? "pointer" : "default",
                  textAlign: "left",
                  borderRadius: 4,
                  opacity: i > step ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: done
                      ? "var(--sev-approve)"
                      : active
                        ? "var(--accent)"
                        : "var(--surface-2)",
                    color: done || active ? "#fff" : "var(--ink-3)",
                    border: `1.5px solid ${
                      done ? "var(--sev-approve)" : active ? "var(--accent)" : "var(--line-2)"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 12,
                    flex: "none",
                  }}
                >
                  {done ? <I.Check size={14} stroke={2.6} /> : <span>{i + 1}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      fontWeight: 600,
                    }}
                  >
                    Step {i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: active
                        ? "var(--accent)"
                        : done
                          ? "var(--ink)"
                          : "var(--ink-2)",
                    }}
                  >
                    {s.label}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      width: 60,
                      height: 2,
                      background: done ? "var(--sev-approve)" : "var(--line)",
                      margin: "0 8px",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "20px 24px" }}>
          {step === 0 && <StageStep include={include} setInclude={setInclude} />}
          {step === 1 && <ValidateStep />}
          {step === 2 && (
            <PreviewStep
              files={includedFiles}
              commitMsg={commitMsg}
              setCommitMsg={setCommitMsg}
            />
          )}
          {step === 3 && <PublishStep commitMsg={commitMsg} log={log} published={published} files={includedFiles} />}
        </div>
      </div>

      <div
        style={{
          padding: "12px 24px",
          borderTop: "1px solid var(--line)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {step === 0 && `${includedFiles.length} of ${LOCAL_CHANGES.length} files staged`}
          {step === 1 &&
            (rejectCount
              ? `${rejectCount} REJECT must be resolved`
              : "All gates pass — proceed to preview")}
          {step === 2 && "Review the diff before committing"}
          {step === 3 && (published ? "✓ Pushed to main" : 'Press "Publish" to run git commit & push')}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={back} disabled={step === 0} icon={<I.ChevLeft size={13} />}>
            Back
          </Button>
          <Button
            variant={step === 3 ? "approve" : "primary"}
            onClick={next}
            disabled={(step === 1 && rejectCount > 0) || (step === 3 && published)}
            icon={step === 3 ? <I.Upload size={13} /> : <I.ChevRight size={13} />}
          >
            {step === 3 ? (published ? "Published" : "Publish") : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StageStep({
  include,
  setInclude,
}: {
  include: Record<string, boolean>;
  setInclude: (m: Record<string, boolean>) => void;
}) {
  const cnt = LOCAL_CHANGES.filter((c) => include[c.path]).length;
  return (
    <div>
      <SectionHead
        title="Stage changes"
        subtitle={`Select which of your ${LOCAL_CHANGES.length} local changes to publish.`}
      />
      <Card padded={false}>
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={cnt === LOCAL_CHANGES.length}
              ref={(el) => {
                if (el) el.indeterminate = cnt > 0 && cnt < LOCAL_CHANGES.length;
              }}
              onChange={(e) =>
                setInclude(
                  Object.fromEntries(LOCAL_CHANGES.map((c) => [c.path, e.target.checked])),
                )
              }
            />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Select all</span>
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {cnt} of {LOCAL_CHANGES.length} selected
          </span>
        </div>
        {LOCAL_CHANGES.map((f, i) => {
          const Ico =
            f.kind === "index"
              ? I.File
              : KIND_ICON[f.kind as PrimitiveKind] ?? I.File;
          return (
            <label
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 20px 28px 1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "8px 12px",
                borderTop: i === 0 ? "0" : "1px solid var(--line)",
                cursor: "pointer",
                background: include[f.path] ? "transparent" : "var(--surface-2)",
              }}
            >
              <input
                type="checkbox"
                checked={!!include[f.path]}
                onChange={(e) => setInclude({ ...include, [f.path]: e.target.checked })}
              />
              <span
                className="mono"
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: f.op === "+" ? "var(--sev-approve)" : "var(--sev-warn)",
                }}
              >
                {f.op}
              </span>
              <Ico size={14} style={{ color: "var(--ink-3)" }} />
              <div>
                <div className="mono" style={{ fontSize: 12 }}>
                  {f.path}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>
                  {KIND_LABEL[f.kind] ?? f.kind} · {f.slug}
                </div>
              </div>
              <StateBadge s={f.state} />
            </label>
          );
        })}
      </Card>
      <div
        style={{
          marginTop: 14,
          padding: "8px 12px",
          background: "var(--sev-info-soft)",
          border: "1px solid rgba(62,110,160,0.2)",
          borderRadius: 5,
          fontSize: 12,
          color: "var(--ink-2)",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <SeverityDot sev="info" style={{ marginTop: 2 }} />
        <div>
          <b>3 primitive changes, 1 bundle change, 3 indexes regenerated.</b>
          <br />
          Indexes are auto-included whenever a primitive change implies a regen — you can't
          deselect them.
        </div>
      </div>
    </div>
  );
}

function ValidateStep() {
  const counts = RECS.reduce<Record<string, number>>((a, r) => {
    a[r.sev] = (a[r.sev] ?? 0) + 1;
    return a;
  }, {});
  return (
    <div>
      <SectionHead
        title="Validate staged set"
        subtitle="Same gates the diff engine runs on incoming PRs — applied to your outgoing changes."
        right={
          <div style={{ display: "flex", gap: 4 }}>
            {Object.entries(counts).map(([s, n]) => (
              <SeverityChip key={s} sev={s as Severity} count={n} />
            ))}
          </div>
        }
      />
      <Card padded={false}>
        {RECS.map((r, i) => {
          const s = SEV[r.sev];
          return (
            <div
              key={i}
              style={{
                padding: "11px 14px",
                borderTop: i === 0 ? "0" : "1px solid var(--line)",
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <SeverityDot sev={r.sev} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div>
                {r.body && (
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                    {r.body}
                  </div>
                )}
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: s.soft,
                  color: s.color,
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </Card>
      <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--ink-3)" }}>
        Validation ran <span className="mono">12 gates</span> in <span className="mono">142ms</span>.
        Consistency with diff-review checks means contributors see the same recommendations you do.
      </div>
    </div>
  );
}

function PreviewStep({
  files,
  commitMsg,
  setCommitMsg,
}: {
  files: LocalChange[];
  commitMsg: string;
  setCommitMsg: (s: string) => void;
}) {
  const [openFile, setOpenFile] = useState(files[0]?.path ?? "");
  useEffect(() => {
    if (!files.find((x) => x.path === openFile) && files[0]) {
      setOpenFile(files[0].path);
    }
  }, [files, openFile]);
  const f = files.find((x) => x.path === openFile) ?? files[0];

  return (
    <div>
      <SectionHead title="Preview diff" subtitle="Verify the change set before commit." />
      <Card padded={false} style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: 360 }}>
          <div style={{ borderRight: "1px solid var(--line)", overflowY: "auto" }}>
            {files.map((file) => {
              const Ico =
                file.kind === "index"
                  ? I.File
                  : KIND_ICON[file.kind as PrimitiveKind] ?? I.File;
              const active = file.path === openFile;
              return (
                <button
                  key={file.path}
                  onClick={() => setOpenFile(file.path)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 10px",
                    background: active ? "var(--surface-2)" : "transparent",
                    border: 0,
                    borderLeft: active
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      width: 12,
                      color: file.op === "+" ? "var(--sev-approve)" : "var(--sev-warn)",
                    }}
                  >
                    {file.op}
                  </span>
                  <Ico size={12} style={{ color: "var(--ink-3)" }} />
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--ink-2)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {file.path.split("/").pop()}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            style={{
              overflowY: "auto",
              padding: "10px 14px",
              background: "var(--surface)",
            }}
          >
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8 }}>
              {f?.path}
            </div>
            <DiffSample which={f?.path ?? ""} />
          </div>
        </div>
      </Card>

      <Card title="Commit message" padded>
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          style={{
            width: "100%",
            minHeight: 70,
            padding: "8px 10px",
            background: "var(--surface)",
            border: "1px solid var(--line-2)",
            borderRadius: 5,
            outline: 0,
            resize: "vertical",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--ink)",
          }}
        />
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
          Multi-line OK. First line becomes the subject. Conventional commits not required.
        </div>
      </Card>
    </div>
  );
}

const DIFFS: Record<string, { t: string; v: string }[]> = {
  "primitives/tools/french-skiver.json": [
    { t: "h", v: "@@ -0,0 +1,28 @@" },
    { t: "+", v: "{" },
    { t: "+", v: '  "kind": "tool",' },
    { t: "+", v: '  "slug": "french-skiver",' },
    { t: "+", v: '  "display_name": "French skiver",' },
    { t: "+", v: '  "hash": "sha256:c8e4f...a2b1",' },
    { t: "+", v: '  "emitter": "opg://5f3a7b1d-c4ee-aa01-bbf2-3c2a1d8e7f4c",' },
    { t: "+", v: '  "license": "CC-BY-4.0",' },
    { t: "+", v: '  "names": {' },
    { t: "+", v: '    "en": { "canonical": "French skiver", "aliases": ["paring knife"] },' },
    { t: "+", v: '    "fr": { "canonical": "couteau à parer", "aliases": [] },' },
    { t: "+", v: '    "de": { "canonical": "Schärfmesser", "aliases": [] }' },
    { t: "+", v: "  }," },
    { t: "+", v: '  "specializes": null,' },
    { t: "+", v: '  "rel": [{ "type": "uses_technique", "target": "skiving" }]' },
    { t: "+", v: "}" },
  ],
  "primitives/techniques/skiving.json": [
    { t: "h", v: "@@ -28,7 +28,7 @@" },
    { t: " ", v: '  "domain": {' },
    { t: " ", v: '    "skillLevel": "intermediate",' },
    { t: "-", v: '    "steps": 3' },
    { t: "+", v: '    "steps": 4' },
    { t: " ", v: "  }" },
    { t: " ", v: "}" },
  ],
  "bundles/saddle-stitch-essentials.json": [
    { t: "h", v: "@@ -14,6 +14,7 @@" },
    { t: " ", v: '  "items": [' },
    { t: " ", v: '    { "kind": "tool", "slug": "maul", "role": "required" },' },
    { t: " ", v: '    { "kind": "tool", "slug": "diamond-awl", "role": "required" },' },
    { t: "+", v: '    { "kind": "tool", "slug": "french-skiver", "role": "recommended" },' },
    { t: " ", v: '    { "kind": "material", "slug": "waxed-thread", "role": "required" },' },
    { t: " ", v: "  ]" },
  ],
  "indexes/resolve/en.json": [
    { t: "h", v: "@@ -42,6 +42,11 @@" },
    { t: " ", v: '  "saddle stitch": { "kind": "technique", "slug": "saddle-stitch" },' },
    { t: "+", v: '  "french skiver": { "kind": "tool", "slug": "french-skiver" },' },
    { t: "+", v: '  "paring knife": { "kind": "tool", "slug": "french-skiver" },' },
    { t: " ", v: '  "vegetable-tanned leather": { "kind": "material", "slug": "vegetable-tanned-leather" },' },
  ],
  "indexes/resolve/de.json": [
    { t: "h", v: "@@ -38,6 +38,9 @@" },
    { t: " ", v: '  "Sattlernaht": { "kind": "technique", "slug": "saddle-stitch" },' },
    { t: "+", v: '  "Schärfmesser": { "kind": "tool", "slug": "french-skiver" },' },
    { t: " ", v: '  "Halbmondmesser": { "kind": "tool", "slug": "round-knife" },' },
  ],
  "indexes/taxonomy/en.json": [
    { t: "h", v: "@@ -12,6 +12,7 @@" },
    { t: " ", v: '  "tool": {' },
    { t: " ", v: '    "awl": { "diamond-awl": { "osborne-diamond-awl": {} }, "scratch-awl": {} },' },
    { t: " ", v: '    "edge-slicker": {},' },
    { t: "+", v: '    "french-skiver": {},' },
    { t: " ", v: '    "maul": {},' },
    { t: " ", v: "  }" },
  ],
};

function DiffSample({ which }: { which: string }) {
  const d = DIFFS[which] ?? [{ t: "h", v: "@@ no diff @@" }];
  const lineStyle = (t: string): React.CSSProperties => ({
    background:
      t === "+"
        ? "rgba(90, 122, 59, 0.10)"
        : t === "-"
          ? "rgba(178, 58, 44, 0.10)"
          : t === "h"
            ? "var(--surface-2)"
            : "transparent",
    color:
      t === "+"
        ? "var(--sev-approve)"
        : t === "-"
          ? "var(--sev-reject)"
          : t === "h"
            ? "var(--ink-3)"
            : "var(--ink-2)",
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 11.5,
    lineHeight: 1.6,
    padding: "0 8px",
    borderLeft:
      t === "+"
        ? "2px solid var(--sev-approve)"
        : t === "-"
          ? "2px solid var(--sev-reject)"
          : t === "h"
            ? "2px solid var(--accent)"
            : "2px solid transparent",
  });
  return (
    <div style={{ borderRadius: 4, overflow: "hidden", border: "1px solid var(--line)" }}>
      {d.map((line, i) => (
        <div key={i} style={lineStyle(line.t)}>
          <span style={{ color: "var(--ink-4)", marginRight: 8, userSelect: "none" }}>
            {line.t === " " ? " " : line.t}
          </span>
          {line.v}
        </div>
      ))}
    </div>
  );
}

function PublishStep({
  commitMsg,
  log,
  published,
  files,
}: {
  commitMsg: string;
  log: string[];
  published: boolean;
  files: LocalChange[];
}) {
  return (
    <div>
      <SectionHead title="Publish" subtitle="git commit · git push · gh release (if needed)" />
      <Card title="Summary">
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 13 }}>
          <span style={{ color: "var(--ink-3)" }}>Files</span>
          <span>
            <b>{files.length}</b> changed
          </span>
          <span style={{ color: "var(--ink-3)" }}>Remote</span>
          <span className="mono">github.com/Skund404/proto-commons</span>
          <span style={{ color: "var(--ink-3)" }}>Branch</span>
          <span className="mono">main</span>
          <span style={{ color: "var(--ink-3)" }}>Subject</span>
          <span style={{ fontStyle: "italic", color: "var(--ink-2)" }}>
            "{commitMsg.split("\n")[0]}"
          </span>
        </div>
      </Card>
      <div style={{ marginTop: 14 }}>
        <Card
          title="Terminal"
          padded={false}
          action={published && <SeverityChip sev="approve" />}
        >
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11.5,
              lineHeight: 1.65,
              padding: "10px 14px",
              color: "var(--ink-2)",
              background: "var(--surface)",
              minHeight: 220,
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {log.length === 0 && (
              <div style={{ color: "var(--ink-3)" }}>
                Press <b>Publish</b> to run the commit + push.
              </div>
            )}
            {log.map((l, i) => (
              <div
                key={i}
                style={{
                  color: l.startsWith("$")
                    ? "var(--accent)"
                    : l.startsWith("✓")
                      ? "var(--sev-approve)"
                      : "var(--ink-2)",
                }}
              >
                {l}
              </div>
            ))}
            {log.length > 0 && !published && (
              <div
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 14,
                  background: "var(--ink-2)",
                  verticalAlign: "-2px",
                  animation: "shimmer 1s linear infinite",
                }}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SectionHead({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 12,
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}
