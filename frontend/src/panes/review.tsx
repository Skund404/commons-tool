import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Empty,
  Hash,
  I,
  Input,
  KIND_ICON,
  KIND_LABEL,
  Modal,
  Tabs,
  SeverityChip,
  SeverityDot,
  SEV,
  StateBadge,
  Toolbar,
} from "@/components";
import { usePRs, useLocalChanges, useMergePR, useCommentPR, useReviewPR } from "@/api/hooks";
import type { PaneArgs } from "@/shell/pane-switch";
import type { PaneId } from "@/nav";
import type { LocalChange, PrimitiveKind, PullRequest, Recommendation, Severity } from "@/types/primitives";

// Extract the primitive slug from a primitives/<kind>/<slug>.json path.
function slugFromPrimitivePath(path: string): string | null {
  const m = path.match(/^primitives\/[^/]+\/([^/]+)\.json$/);
  return m ? m[1] : null;
}

type ReviewTab = "prs" | "local" | "refs";
type Verdict = "approved" | "rejected" | "changes-requested" | "commented";
type ActionKind = "approve" | "reject" | "changes" | "comment";

interface Modal_ {
  kind: ActionKind;
  prId: number;
}

interface PaneReviewProps {
  initialPrId?: number;
  go?: (id: PaneId, args?: PaneArgs) => void;
}

export function PaneReview({ initialPrId, go }: PaneReviewProps) {
  const [tab, setTab] = useState<ReviewTab>("prs");
  const { data: prs = [], refetch: refetchPrs, isFetching } = usePRs();
  const { data: localChanges = [] } = useLocalChanges();
  const mergeMut = useMergePR();
  const commentMut = useCommentPR();
  const reviewMut = useReviewPR();
  const [selectedPr, setSelectedPr] = useState<number>(initialPrId ?? prs[0]?.id ?? 0);
  const [decision, setDecision] = useState<Record<number, Verdict>>({});
  const [modal, setModal] = useState<Modal_ | null>(null);

  useEffect(() => {
    if (initialPrId) {
      setTab("prs");
      setSelectedPr(initialPrId);
    }
  }, [initialPrId]);

  // Auto-select the first PR once the list arrives, if no explicit selection.
  useEffect(() => {
    if (!initialPrId && selectedPr === 0 && prs.length > 0) {
      setSelectedPr(prs[0].id);
    }
  }, [prs, initialPrId, selectedPr]);

  const pr = prs.find((p) => p.id === selectedPr);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar
        left={
          <>
            <I.GitPullReq size={16} style={{ color: "var(--ink-2)" }} />
            <span style={{ fontWeight: 600 }}>Review</span>
            <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
              · Semantic diff & recommendations
            </span>
          </>
        }
        right={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<I.Refresh size={12} />}
              onClick={() => refetchPrs()}
              disabled={isFetching}
            >
              {isFetching ? "Refreshing…" : "Refresh PRs"}
            </Button>
            <Button variant="default" size="sm" icon={<I.ExternalLink size={12} />}>
              Open on GitHub
            </Button>
          </>
        }
      />
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <Tabs<ReviewTab>
          value={tab}
          onChange={setTab}
          items={[
            {
              value: "prs",
              label: "Pending PRs",
              icon: <I.GitPullReq size={13} />,
              badge: prs.length,
            },
            {
              value: "local",
              label: "Local Working Changes",
              icon: <I.FilePencil size={13} />,
              badge: localChanges.length,
            },
            { value: "refs", label: "Arbitrary Refs", icon: <I.Branch size={13} /> },
          ]}
        />
      </div>

      {tab === "prs" && (
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            minHeight: 0,
          }}
        >
          <PrList
            prs={prs}
            selectedId={selectedPr}
            onSelect={setSelectedPr}
            decision={decision}
          />
          {pr && (
            <PrDetail
              pr={pr}
              decision={decision[pr.id]}
              onAction={(kind) => setModal({ kind, prId: pr.id })}
              onOpenInEditor={
                go
                  ? (slug) => go("editor", { slug })
                  : undefined
              }
            />
          )}
        </div>
      )}

      {tab === "local" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <LocalWorkingChanges
            changes={localChanges}
            onOpenInEditor={
              go
                ? (slug) => go("editor", { slug })
                : undefined
            }
          />
        </div>
      )}

      {tab === "refs" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <ArbitraryRefs />
        </div>
      )}

      <ReviewActionModal
        modal={modal}
        prs={prs}
        onClose={() => setModal(null)}
        onSubmit={async (verdict, body) => {
          if (!modal) return;
          try {
            if (modal.kind === "approve") {
              await mergeMut.mutateAsync({ num: modal.prId, method: "squash" });
            } else if (modal.kind === "comment") {
              await commentMut.mutateAsync({ num: modal.prId, body });
            } else if (modal.kind === "reject") {
              await reviewMut.mutateAsync({
                num: modal.prId,
                verdict: "request",
                body,
              });
            } else if (modal.kind === "changes") {
              await reviewMut.mutateAsync({
                num: modal.prId,
                verdict: "request",
                body,
              });
            }
            setDecision((d) => ({ ...d, [modal.prId]: verdict }));
          } catch (err) {
            console.error("Review action failed:", err);
            // surface error but keep modal open so user can retry
            return;
          }
          setModal(null);
        }}
      />
    </div>
  );
}

function PrList({
  prs,
  selectedId,
  onSelect,
  decision,
}: {
  prs: PullRequest[];
  selectedId: number;
  onSelect: (id: number) => void;
  decision: Record<number, Verdict>;
}) {
  return (
    <div
      style={{
        borderRight: "1px solid var(--line)",
        overflowY: "auto",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--line)",
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 600,
        }}
      >
        Open ({prs.length})
      </div>
      {prs.map((pr) => {
        const active = pr.id === selectedId;
        const counts = pr.recs.reduce<Record<string, number>>((a, r) => {
          a[r.sev] = (a[r.sev] ?? 0) + 1;
          return a;
        }, {});
        const dec = decision[pr.id];
        return (
          <div
            key={pr.id}
            onClick={() => onSelect(pr.id)}
            style={{
              padding: "10px 12px",
              borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
              background: active ? "var(--surface-2)" : "transparent",
              cursor: "pointer",
              borderBottom: "1px solid var(--line)",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "var(--surface-2)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                #{pr.id}
              </span>
              {dec && <DecisionTag verdict={dec} />}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 2 }}>{pr.title}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
              {pr.author} · {pr.age}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              {counts.reject ? <SeverityChip sev="reject" count={counts.reject} /> : null}
              {counts.warn ? <SeverityChip sev="warn" count={counts.warn} /> : null}
              {!counts.reject && !counts.warn ? <SeverityChip sev="approve" /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DecisionTag({ verdict }: { verdict: Verdict }) {
  const m: Record<Verdict, { label: string; sev: Severity }> = {
    approved: { label: "Merged", sev: "approve" },
    rejected: { label: "Rejected", sev: "reject" },
    "changes-requested": { label: "Changes", sev: "warn" },
    commented: { label: "Commented", sev: "info" },
  };
  const v = m[verdict];
  const s = SEV[v.sev];
  return (
    <span
      className="mono"
      style={{
        fontSize: 9,
        padding: "1px 5px",
        borderRadius: 2,
        background: s.soft,
        color: s.color,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: "uppercase",
      }}
    >
      {v.label}
    </span>
  );
}

function PrDetail({
  pr,
  decision,
  onAction,
  onOpenInEditor,
}: {
  pr: PullRequest;
  decision: Verdict | undefined;
  onAction: (kind: ActionKind) => void;
  onOpenInEditor?: (slug: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const counts = useMemo(
    () =>
      pr.recs.reduce<Record<string, number>>((a, r) => {
        a[r.sev] = (a[r.sev] ?? 0) + 1;
        return a;
      }, {}),
    [pr],
  );
  const hasReject = !!counts.reject;
  const mergeable = !hasReject && !decision;

  return (
    <div style={{ overflowY: "auto", background: "var(--bg)" }}>
      <div style={{ padding: "16px 20px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--ink-3)",
              }}
            >
              <I.GitPullReq size={13} style={{ color: "var(--sev-approve)" }} />
              <span className="mono">#{pr.id}</span>
              <span>·</span>
              <span>
                <I.Branch size={11} /> {pr.branch}
              </span>
              <span>·</span>
              <span>{pr.age}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>{pr.title}</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: "var(--ink-2)",
                marginTop: 4,
              }}
            >
              <span>@{pr.author}</span>
              <span style={{ color: "var(--ink-4)" }}>·</span>
              <span
                style={{
                  color: pr.authorMeta.includes("first") ? "var(--accent)" : "var(--ink-3)",
                }}
              >
                {pr.authorMeta}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flex: "none" }}>
            {Object.entries(counts).map(([sev, n]) => (
              <SeverityChip key={sev} sev={sev as Severity} count={n} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px 0" }}>
        <Card title={`Files changed · ${pr.files.length}`} padded={false}>
          {pr.files.map((f, i) => {
            const primSlug = slugFromPrimitivePath(f.path);
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr auto auto",
                  alignItems: "center",
                  padding: "7px 12px",
                  borderTop: i === 0 ? "0" : "1px solid var(--line)",
                  gap: 8,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color:
                      f.op === "+"
                        ? "var(--sev-approve)"
                        : f.op === "M"
                          ? "var(--sev-warn)"
                          : "var(--sev-reject)",
                  }}
                >
                  {f.op}
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink)" }}>
                  {f.path}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  <span style={{ color: "var(--sev-approve)" }}>+{f.added}</span>{" "}
                  <span style={{ color: "var(--sev-reject)" }}>−{f.removed}</span>
                </span>
                {primSlug && onOpenInEditor ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<I.EditPen size={11} />}
                    onClick={() => onOpenInEditor(primSlug)}
                    title="Open this primitive in the editor"
                  >
                    Edit
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </Card>
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        <Card title="Semantic changes" subtitle="Parsed by the diff engine, not raw text">
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
            {pr.semantic.map((s, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "3px 0",
                  fontSize: 12.5,
                }}
              >
                <I.Dot size={10} style={{ color: "var(--accent)", marginTop: 4, flex: "none" }} />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        <Card
          title={`Recommendations · ${pr.recs.length}`}
          subtitle="Click any row to inspect the check"
          padded={false}
        >
          {pr.recs.map((r, i) => (
            <RecRow
              key={i}
              r={r}
              first={i === 0}
              open={expanded.has(i)}
              onToggle={() => toggle(i)}
              onOpenInEditor={onOpenInEditor}
            />
          ))}
        </Card>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--surface)",
          borderTop: "1px solid var(--line)",
          padding: "12px 20px",
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          boxShadow: "0 -4px 12px rgba(31,27,23,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--ink-3)",
          }}
        >
          {hasReject ? (
            <>
              <SeverityDot sev="reject" />{" "}
              <span>1 REJECT must be resolved before merging.</span>
            </>
          ) : decision ? (
            <>
              <DecisionTag verdict={decision} />{" "}
              <span style={{ color: "var(--ink-3)" }}>
                Decision recorded — review another PR.
              </span>
            </>
          ) : (
            <>
              <SeverityDot sev="approve" /> <span>No blocking checks. Ready to merge.</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="ghost"
            icon={<I.EditPen size={13} />}
            onClick={() => onAction("comment")}
          >
            Comment
          </Button>
          <Button
            variant="danger"
            icon={<I.X size={13} />}
            onClick={() => onAction("reject")}
            disabled={!!decision}
          >
            Reject
          </Button>
          <Button
            variant="default"
            icon={<I.Refresh size={13} />}
            onClick={() => onAction("changes")}
            disabled={!!decision}
          >
            Request changes
          </Button>
          <Button
            variant="approve"
            icon={<I.Check size={13} />}
            onClick={() => onAction("approve")}
            disabled={!mergeable}
          >
            Approve &amp; Merge
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecRow({
  r,
  first,
  open,
  onToggle,
  onOpenInEditor,
}: {
  r: Recommendation;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenInEditor?: (slug: string) => void;
}) {
  const s = SEV[r.sev];
  return (
    <div style={{ borderTop: first ? "0" : "1px solid var(--line)" }}>
      <div
        onClick={onToggle}
        style={{
          padding: "10px 12px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 10,
          alignItems: "center",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <SeverityDot sev={r.sev} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div>
          {r.file && !open && (
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              {r.file}
            </div>
          )}
        </div>
        <span
          style={{
            color: "var(--ink-3)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 120ms",
            display: "inline-flex",
          }}
        >
          <I.ChevRight size={14} />
        </span>
      </div>
      {open && (
        <div
          style={{
            padding: "0 12px 12px 40px",
            fontSize: 12.5,
            color: "var(--ink-2)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {r.body && <div style={{ lineHeight: 1.55 }}>{r.body}</div>}
          {r.file && (
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: 4,
                padding: "6px 8px",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <I.File size={12} style={{ color: "var(--ink-3)" }} />
              <span className="mono" style={{ flex: 1, minWidth: 0 }}>{r.file}</span>
              {r.hash && (
                <>
                  <span style={{ color: "var(--ink-4)" }}>·</span>
                  <Hash value={r.hash} />
                </>
              )}
              {(() => {
                const slug = slugFromPrimitivePath(r.file);
                if (!slug || !onOpenInEditor) return null;
                return (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<I.EditPen size={11} />}
                    onClick={() => onOpenInEditor(slug)}
                    title="Open this primitive in the editor"
                  >
                    Edit
                  </Button>
                );
              })()}
            </div>
          )}
          {r.suggest && (
            <div
              style={{
                borderLeft: `2px solid ${s.color}`,
                paddingLeft: 8,
                fontSize: 12.5,
                color: "var(--ink-2)",
              }}
            >
              <b
                style={{
                  color: s.color,
                  textTransform: "uppercase",
                  fontSize: 10,
                  letterSpacing: 0.8,
                }}
              >
                Suggestion
              </b>
              <div style={{ marginTop: 2 }}>{r.suggest}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewActionModal({
  modal,
  prs,
  onClose,
  onSubmit,
}: {
  modal: Modal_ | null;
  prs: PullRequest[];
  onClose: () => void;
  onSubmit: (verdict: Verdict, body: string) => void;
}) {
  const [comment, setComment] = useState("");
  useEffect(() => {
    if (!modal) {
      setComment("");
      return;
    }
    const pr = prs.find((p) => p.id === modal.prId);
    if (!pr) return;
    if (modal.kind === "changes") {
      const lines = pr.recs
        .filter((r) => r.sev === "warn" || r.sev === "reject")
        .map(
          (r) =>
            `[${r.sev.toUpperCase()}] ${r.title}${r.suggest ? `\n  → ${r.suggest}` : ""}`,
        )
        .join("\n\n");
      setComment(
        `Thanks for the contribution! A few things to address before this can merge:\n\n${lines}`,
      );
    } else if (modal.kind === "reject") {
      setComment("Closing for now — please open a follow-up if you'd like to revisit.\n");
    } else if (modal.kind === "approve") {
      setComment("Looks good — merging. Thank you for the contribution!\n");
    } else {
      setComment("");
    }
  }, [modal]);

  if (!modal) return null;

  const conf: Record<
    ActionKind,
    { title: string; verdict: Verdict; submit: string; variant: "approve" | "default" | "danger" | "primary" }
  > = {
    approve: { title: "Approve & merge", verdict: "approved", submit: "Merge to main", variant: "approve" },
    changes: {
      title: "Request changes",
      verdict: "changes-requested",
      submit: "Submit request",
      variant: "default",
    },
    reject: { title: "Reject pull request", verdict: "rejected", submit: "Close as rejected", variant: "danger" },
    comment: { title: "Comment", verdict: "commented", submit: "Post comment", variant: "primary" },
  };
  const c = conf[modal.kind];

  return (
    <Modal
      open
      onClose={onClose}
      title={`${c.title} · PR #${modal.prId}`}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={c.variant} onClick={() => onSubmit(c.verdict, comment)}>
            {c.submit}
          </Button>
        </>
      }
    >
      {modal.kind === "changes" && (
        <div
          style={{
            marginBottom: 10,
            fontSize: 12,
            color: "var(--ink-3)",
            padding: "6px 10px",
            background: "var(--sev-warn-soft)",
            border: "1px solid rgba(182,130,32,0.2)",
            borderRadius: 4,
          }}
        >
          <I.Info size={12} /> &nbsp;Pre-filled from WARN/REJECT recommendations. Edit before
          sending.
        </div>
      )}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment…"
        style={{
          width: "100%",
          minHeight: 180,
          background: "var(--surface)",
          border: "1px solid var(--line-2)",
          borderRadius: 5,
          padding: 10,
          fontFamily: "inherit",
          fontSize: 13,
          color: "var(--ink)",
          outline: 0,
          resize: "vertical",
        }}
      />
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
        Comment will be posted via{" "}
        <code
          style={{
            background: "var(--surface-2)",
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          gh pr
        </code>
        .
      </div>
    </Modal>
  );
}

function LocalWorkingChanges({
  changes,
  onOpenInEditor,
}: {
  changes: LocalChange[];
  onOpenInEditor?: (slug: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card
        title={`Local working changes · ${changes.length}`}
        subtitle="Your uncommitted diff against `main`"
        action={
          <Button variant="primary" size="sm" icon={<I.Upload size={12} />}>
            Open publish workflow
          </Button>
        }
        padded={false}
      >
        {changes.map((f, i) => {
          const Ico =
            f.kind === "index" || f.kind === "bundle"
              ? I.File
              : KIND_ICON[f.kind as PrimitiveKind] ?? I.File;
          const isPrimitive =
            f.kind === "tool" ||
            f.kind === "material" ||
            f.kind === "technique" ||
            f.kind === "workflow";
          return (
            <div
              key={i}
              style={{
                padding: "10px 14px",
                borderTop: i === 0 ? "0" : "1px solid var(--line)",
                display: "grid",
                gridTemplateColumns: "24px 28px 1fr 90px 100px",
                gap: 10,
                alignItems: "center",
              }}
            >
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
                <div className="mono" style={{ fontSize: 12, color: "var(--ink)" }}>
                  {f.path}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>
                  {KIND_LABEL[f.kind] ?? f.kind} · {f.slug}
                </div>
              </div>
              <StateBadge s={f.state} />
              <div style={{ textAlign: "right" }}>
                {isPrimitive && onOpenInEditor && f.slug && f.slug !== "—" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<I.EditPen size={11} />}
                    onClick={() => onOpenInEditor(f.slug)}
                  >
                    Edit
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm">
                    Diff →
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function ArbitraryRefs(): ReactNode {
  return (
    <div style={{ padding: 20 }}>
      <Card title="Compare arbitrary refs" subtitle="Audit any two refs in this repository">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 32px 1fr",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Input leadingIcon={<I.Branch size={12} />} defaultValue="main" />
          <div style={{ textAlign: "center", color: "var(--ink-3)" }}>
            <I.ArrowRight size={14} />
          </div>
          <Input
            leadingIcon={<I.Branch size={12} />}
            defaultValue="contrib/scratch-awl"
          />
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary" size="sm" icon={<I.Refresh size={12} />}>
            Run diff
          </Button>
        </div>
      </Card>
      <div style={{ marginTop: 14 }}>
        <Empty
          icon={<I.Branch size={20} />}
          title="No comparison yet"
          body="Pick two refs above and the semantic diff engine will run all gates and produce recommendations."
        />
      </div>
    </div>
  );
}
