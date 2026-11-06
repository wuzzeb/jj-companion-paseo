import { useState } from "react";
import type { ReviewTarget } from "../shared/review.js";

function selectedRevset(target: ReviewTarget): string {
  if (target.kind === "revisions") return target.revset;
  if (target.kind === "change") return target.revision;
  if (target.kind !== "selection") return "@";
  const anchor = `change_id("${target.anchor.changeId}")`;
  return target.end ? `${anchor}::change_id("${target.end.changeId}")` : anchor;
}

export function ReviewComparisonForm({
  target,
  busy,
  onOpen,
  onCancel,
}: {
  readonly target: ReviewTarget;
  readonly busy: boolean;
  readonly onOpen: (target: ReviewTarget) => void;
  readonly onCancel: () => void;
}) {
  const [mode, setMode] = useState(target.kind);
  const [from, setFrom] = useState(
    target.kind === "endpoints" ? target.from : "fork_point(main|@)",
  );
  const [to, setTo] = useState(target.kind === "endpoints" ? target.to : "@");
  const [revset, setRevset] = useState(selectedRevset(target));
  const [change, setChange] = useState(
    target.kind === "change"
      ? target.revision
      : target.kind === "selection"
        ? target.anchor.changeId
        : "@",
  );
  const valid =
    mode === "endpoints"
      ? !!from.trim() && !!to.trim()
      : mode === "revisions"
        ? !!revset.trim()
        : mode === "change"
          ? !!change.trim()
          : true;
  return (
    <form
      className="review-comparison-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !valid) return;
        onOpen(
          mode === "endpoints"
            ? { kind: mode, from: from.trim(), to: to.trim() }
            : mode === "revisions"
              ? { kind: mode, revset: revset.trim() }
              : mode === "change"
                ? { kind: mode, revision: change.trim() }
                : mode === "branch"
                  ? { kind: mode }
                  : target,
        );
      }}
    >
      <label>
        Comparison
        <select
          aria-label="Comparison mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as ReviewTarget["kind"])}
        >
          <option value="branch">Branch changes</option>
          <option value="change">Single change</option>
          <option value="revisions">Changes (revset)</option>
          <option value="endpoints">Compare revisions</option>
          {target.kind === "selection" ? (
            <option value="selection">Selected {target.end ? "range" : "change"}</option>
          ) : null}
        </select>
      </label>
      {mode === "endpoints" ? (
        <>
          <label>
            From
            <input
              data-pmono=""
              aria-label="From revision"
              value={from}
              maxLength={4096}
              onChange={(event) => setFrom(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label>
            To
            <input
              data-pmono=""
              aria-label="To revision"
              value={to}
              maxLength={4096}
              onChange={(event) => setTo(event.target.value)}
              spellCheck={false}
            />
          </label>
        </>
      ) : mode === "change" ? (
        <label>
          Change
          <input
            data-pmono=""
            aria-label="Change revision"
            value={change}
            maxLength={4096}
            onChange={(event) => setChange(event.target.value)}
            spellCheck={false}
          />
        </label>
      ) : mode === "revisions" ? (
        <label>
          Revset
          <input
            data-pmono=""
            aria-label="Changes revset"
            value={revset}
            maxLength={4096}
            onChange={(event) => setRevset(event.target.value)}
            spellCheck={false}
          />
        </label>
      ) : mode === "selection" ? (
        <span className="review-expression-hint">
          {target.kind === "selection" && target.end
            ? "Combined diff, including both endpoints."
            : "Change compared with its parents."}
        </span>
      ) : (
        <span className="review-expression-hint">fork_point(main|@) → @</span>
      )}
      <div className="review-dialog-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !valid}>
          Open diff
        </button>
      </div>
    </form>
  );
}
