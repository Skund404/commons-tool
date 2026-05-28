import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  I,
  KIND_ICON,
  LangBadge,
  Modal,
  SeverityChip,
  SeverityDot,
  StateBadge,
} from "@/components";
import { PRIMS, BUNDLES as _BUNDLES, PRS, SUGGESTIONS, COMMITS, FED_ROOTS, LOCAL_CHANGES, PASCAL_EMITTER_URI } from "@/fixtures";
import type { PaneArgs } from "@/shell/pane-switch";
import type { PaneId } from "@/nav";
import type { PullRequest, Suggestion, Commit, FederationRoot, PrimitiveKind } from "@/types/primitives";

void _BUNDLES;

interface PaneProps {
  go: (id: PaneId, args?: PaneArgs) => void;
}

export function PaneDashboard({ go }: PaneProps) {
  const counts = useMemo(() => {
    const c: Record<PrimitiveKind, number> = {
      tool: 0,
      material: 0,
      technique: 0,
      workflow: 0,
      project: 0,
      event: 0,
    };
    PRIMS.forEach((p) => {
      c[p.kind] = (c[p.kind] ?? 0) + 1;
    });
    return c;
  }, []);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const openPRs = PRS;
  const openSug = SUGGESTIONS.filter((s) => s.status !== "published" && s.status !== "declined");

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Maintainer · {PASCAL_EMITTER_URI}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>Good morning, Pascal.</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
            The commons has <b style={{ color: "var(--ink)" }}>{total} primitives</b>,&nbsp;
            <b style={{ color: "var(--ink)" }}>{openPRs.length} open pull requests</b>, and&nbsp;
            <b style={{ color: "var(--ink)" }}>{LOCAL_CHANGES.length} uncommitted local changes</b>.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="default" icon={<I.Refresh size={13} />}>
            Sync federation
          </Button>
          <Button variant="primary" icon={<I.Upload size={13} />} onClick={() => go("publish")}>
            Publish working changes
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.1fr) minmax(0, 1fr)", gap: 14 }}>
        <CorpusHealthCard counts={counts} total={total} />
        <LocalChangesCard go={go} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14 }}>
        <OpenPRsCard prs={openPRs} go={go} />
        <SuggestionsCard items={openSug} go={go} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 14 }}>
        <RecentCommitsCard commits={COMMITS} />
        <FederationCard roots={FED_ROOTS} />
      </div>
    </div>
  );
}

function CorpusHealthCard({
  counts,
  total: _total,
}: {
  counts: Record<PrimitiveKind, number>;
  total: number;
}) {
  void _total;
  const order: PrimitiveKind[] = ["tool", "material", "technique", "workflow", "project", "event"];
  const max = Math.max(...order.map((k) => counts[k] ?? 0), 1);
  return (
    <Card
      title="Corpus health"
      subtitle="Last full validation: 2 hours ago · 0 errors · 1 warning"
      action={<SeverityChip sev="approve" />}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
        <div>
          {order.map((k) => {
            const Ico = KIND_ICON[k];
            const n = counts[k] ?? 0;
            const w = (n / max) * 100;
            return (
              <div
                key={k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "82px 1fr 32px",
                  alignItems: "center",
                  gap: 10,
                  padding: "5px 0",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-2)" }}>
                  <Ico size={13} />
                  <span style={{ fontSize: 12, textTransform: "capitalize" }}>{k}</span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--surface-2)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${w}%`,
                      height: "100%",
                      background: "var(--accent)",
                      opacity: 0.85,
                    }}
                  />
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 12, textAlign: "right", color: "var(--ink-2)" }}
                >
                  {n}
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "4px 0 0 16px",
            borderLeft: "1px solid var(--line)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              Last 7 days
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              <Metric label="Added" value="+4" tone="approve" />
              <Metric label="Modified" value="11" />
              <Metric label="Validated" value="100%" tone="approve" />
              <Metric label="Bundles" value="3" />
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--ink-3)" }}>
            <I.Sparkle size={11} /> &nbsp;1 alias collision flagged in{" "}
            <span className="mono" style={{ color: "var(--ink-2)" }}>
              resolve/en
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "approve" }) {
  const c = tone === "approve" ? "var(--sev-approve)" : "var(--ink)";
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{label}</div>
      <div
        className="mono"
        style={{ fontSize: 18, fontWeight: 600, color: c, lineHeight: 1.1, marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  );
}

function LocalChangesCard({ go }: { go: PaneProps["go"] }) {
  const cnt: Record<string, number> = { "+": 0, M: 0, "-": 0 };
  LOCAL_CHANGES.forEach((c) => {
    cnt[c.op] = (cnt[c.op] ?? 0) + 1;
  });
  return (
    <Card
      title="Local working state"
      subtitle={`${LOCAL_CHANGES.length} files changed against \`main\``}
      action={<StateBadge s="staged" />}
    >
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <Pill label={`+${cnt["+"]}`} color="var(--sev-approve)" sub="added" />
        <Pill label={`~${cnt.M}`} color="var(--sev-warn)" sub="modified" />
        <Pill label={`-${cnt["-"]}`} color="var(--sev-reject)" sub="deleted" />
      </div>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginBottom: 10 }}>
        {LOCAL_CHANGES.slice(0, 3).map((f, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "2px 0",
            }}
          >
            <span
              className="mono"
              style={{
                color: f.op === "+" ? "var(--sev-approve)" : "var(--sev-warn)",
                width: 12,
              }}
            >
              {f.op}
            </span>
            <span
              className="mono"
              style={{
                color: "var(--ink-2)",
                fontSize: 11,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {f.path}
            </span>
          </div>
        ))}
        {LOCAL_CHANGES.length > 3 && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", padding: "2px 0" }}>
            +{LOCAL_CHANGES.length - 3} more…
          </div>
        )}
      </div>
      <Button
        variant="primary"
        style={{ width: "100%" }}
        onClick={() => go("publish")}
        icon={<I.ArrowRight size={12} />}
      >
        Open publish workflow
      </Button>
    </Card>
  );
}

function Pill({ label, color, sub }: { label: string; color: string; sub: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "6px 10px",
        border: "1px solid var(--line)",
        borderRadius: 5,
        background: "var(--surface-2)",
      }}
    >
      <div className="mono" style={{ fontSize: 16, fontWeight: 600, color, lineHeight: 1.1 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--ink-3)",
          marginTop: 2,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function OpenPRsCard({ prs, go }: { prs: PullRequest[]; go: PaneProps["go"] }) {
  return (
    <Card
      title={`Open pull requests · ${prs.length}`}
      subtitle="Recommendations are computed locally by the diff engine"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go("review")}
          icon={<I.ArrowRight size={12} />}
        >
          Open review
        </Button>
      }
      padded={false}
    >
      {prs.map((pr, i) => {
        const counts = pr.recs.reduce<Record<string, number>>((a, r) => {
          a[r.sev] = (a[r.sev] ?? 0) + 1;
          return a;
        }, {});
        return (
          <div
            key={pr.id}
            onClick={() => go("review", { prId: pr.id })}
            style={{
              padding: "10px 12px",
              borderTop: i === 0 ? "0" : "1px solid var(--line)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <I.GitPullReq size={16} style={{ color: "var(--ink-3)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span className="mono" style={{ color: "var(--ink-3)" }}>
                  #{pr.id}
                </span>
                <span
                  style={{
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pr.title}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--ink-3)",
                  marginTop: 3,
                }}
              >
                <span>
                  <I.User size={10} /> {pr.author}
                </span>
                <span>·</span>
                <span>
                  <I.Clock size={10} /> {pr.age}
                </span>
                {pr.authorMeta && (
                  <>
                    <span>·</span>
                    <span style={{ color: "var(--accent)" }}>{pr.authorMeta}</span>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {counts.reject ? <SeverityChip sev="reject" count={counts.reject} /> : null}
              {counts.warn ? <SeverityChip sev="warn" count={counts.warn} /> : null}
              {counts.info && !counts.reject ? (
                <SeverityChip sev="info" count={counts.info} />
              ) : null}
              {!counts.reject && !counts.warn ? (
                <SeverityChip sev="approve" count={counts.approve} />
              ) : null}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function SuggestionsCard({ items, go }: { items: Suggestion[]; go: PaneProps["go"] }) {
  const [local, setLocal] = useState<Suggestion[]>(items);
  const [declining, setDeclining] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  useEffect(() => setLocal(items), [items]);

  const setStatus = (id: string, status: Suggestion["status"]) =>
    setLocal((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));

  const visible = local.filter((s) => s.status === "open" || s.status === "authoring");
  const declined = local.filter((s) => s.status === "declined");

  return (
    <Card
      title={`Suggestions queue · ${visible.length}`}
      subtitle="Informal community input from Discord/Reddit"
      action={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {declined.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{declined.length} declined</span>
          )}
          <Button variant="ghost" size="sm" icon={<I.ArrowRight size={12} />}>
            Triage
          </Button>
        </span>
      }
      padded={false}
    >
      {visible.length === 0 && (
        <div style={{ padding: 18, textAlign: "center", color: "var(--ink-3)", fontSize: 12 }}>
          Queue is empty.
        </div>
      )}
      {visible.map((s, i) => (
        <div
          key={s.id}
          style={{
            padding: "10px 12px",
            borderTop: i === 0 ? "0" : "1px solid var(--line)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <SuggestStatus s={s.status} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.title}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              {s.source} · {s.captured}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flex: "none" }}>
            {s.status === "open" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus(s.id, "authoring")}
                title="Mark as in-progress so others know you're working on it."
              >
                In-progress
              </Button>
            )}
            {s.status === "authoring" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus(s.id, "open")}
                title="Put back into the open queue."
              >
                Release
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              style={{ color: "var(--sev-reject)" }}
              onClick={() => {
                setDeclining(s.id);
                setDeclineReason("");
              }}
            >
              Decline
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setStatus(s.id, "authoring");
                go("editor", { fresh: true });
              }}
            >
              Author →
            </Button>
          </div>
        </div>
      ))}

      <Modal
        open={!!declining}
        onClose={() => setDeclining(null)}
        title="Decline suggestion"
        width={480}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<I.X size={12} />}
              onClick={() => {
                if (declining) setStatus(declining, "declined");
                setDeclining(null);
              }}
            >
              Decline
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 10 }}>
          The suggestion will be moved to <b>declined</b>. A reason helps the community understand
          the decision and shows up in the audit log.
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            textTransform: "uppercase",
            letterSpacing: 0.6,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Reason
        </div>
        <textarea
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
          placeholder="e.g. out of scope for leatherworking commons"
          style={{
            width: "100%",
            minHeight: 80,
            padding: 8,
            background: "var(--surface)",
            border: "1px solid var(--line-2)",
            borderRadius: 5,
            outline: 0,
            resize: "vertical",
            fontFamily: "inherit",
            fontSize: 13,
            color: "var(--ink)",
          }}
        />
      </Modal>
    </Card>
  );
}

function SuggestStatus({ s }: { s: Suggestion["status"] }) {
  const m: Record<Suggestion["status"], { color: string; bg: string }> = {
    open: { color: "var(--ink-3)", bg: "var(--surface-3)" },
    authoring: { color: "var(--sev-warn)", bg: "var(--sev-warn-soft)" },
    declined: { color: "var(--sev-reject)", bg: "var(--sev-reject-soft)" },
    published: { color: "var(--sev-approve)", bg: "var(--sev-approve-soft)" },
  };
  const v = m[s];
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        padding: "1px 5px",
        borderRadius: 3,
        background: v.bg,
        color: v.color,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        fontWeight: 600,
        marginTop: 2,
        flex: "none",
      }}
    >
      {s}
    </span>
  );
}

function RecentCommitsCard({ commits }: { commits: Commit[] }) {
  return (
    <Card title="Recent commits on `main`" subtitle="github.com/Skund404/proto-commons" padded={false}>
      {commits.map((c, i) => (
        <div
          key={c.sha}
          style={{
            padding: "8px 12px",
            borderTop: i === 0 ? "0" : "1px solid var(--line)",
            display: "grid",
            gridTemplateColumns: "84px 1fr 110px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
            {c.sha}
          </span>
          <span
            style={{
              fontSize: 12.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {c.msg}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>
            {c.author} · {c.time}
          </span>
        </div>
      ))}
    </Card>
  );
}

function FederationCard({ roots }: { roots: FederationRoot[] }) {
  return (
    <Card title="Federation" subtitle={`${roots.length} roots configured`} padded={false}>
      {roots.map((r, i) => (
        <div
          key={r.id}
          style={{
            padding: "10px 12px",
            borderTop: i === 0 ? "0" : "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <I.Globe
            size={14}
            style={{ color: r.role === "primary" ? "var(--accent)" : "var(--ink-3)" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {r.name}
              {r.role === "primary" && (
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  }}
                >
                  primary
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              <span className="mono">{r.url}</span> · {r.primCount} primitives · last sync{" "}
              {r.lastSync}
            </div>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {r.language.map((l) => (
              <LangBadge key={l} lang={l} present />
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}

void SeverityDot;
