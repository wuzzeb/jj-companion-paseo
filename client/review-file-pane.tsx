import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { reviewFileRpc, type ReviewFile, type ReviewSnapshot } from "../shared/review.js";
import { collapseContext } from "./review-context.js";
import { inlineDiff } from "./review-layout.js";
import { IconButton } from "./icon-button.js";
import { JayJayDiff } from "./jayjay-diff.js";

export function FilePane({
  hostId,
  workspaceId,
  repository,
  snapshot,
  file,
  split,
  onToggleLayout,
}: {
  readonly hostId: string;
  readonly workspaceId: string;
  readonly repository: string;
  readonly snapshot: ReviewSnapshot;
  readonly file: ReviewFile;
  readonly split: boolean;
  readonly onToggleLayout: () => void;
}) {
  const read = useRpc(reviewFileRpc);
  const [showAll, setShowAll] = useState(false);
  const query = useQuery({
    queryKey: ["jj-review-file", hostId, workspaceId, repository, snapshot, file.path],
    queryFn: () => read({ workspaceId, repository, snapshot, path: file.path }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
  const complete = query.data?.view;
  const collapsed = useMemo(() => (complete ? collapseContext(complete) : undefined), [complete]);
  const hasContext = collapsed?.rows.some((row) => row.cells[0]?.style === "separator");
  const contextView = showAll ? complete : collapsed;
  const view = useMemo(
    () => (contextView && !split ? inlineDiff(contextView) : contextView),
    [contextView, split],
  );
  return (
    <section className="review-file-pane" aria-label={`Diff for ${file.path}`}>
      <div className="review-file-header">
        <span className="review-path" data-pmono="">
          {file.oldPath === file.path ? file.path : `${file.oldPath} → ${file.path}`}
        </span>
        {complete ? (
          <span className="review-stats">
            <span className="review-stats-added">+{complete.added}</span>{" "}
            <span className="review-stats-removed">−{complete.removed}</span>
          </span>
        ) : null}
        {hasContext ? (
          <IconButton
            icon={showAll ? "FoldVertical" : "UnfoldVertical"}
            label="Show all context"
            title={showAll ? "Collapse unchanged context" : "Show all context"}
            pressed={showAll}
            onClick={() => setShowAll(!showAll)}
          />
        ) : null}
        <IconButton
          onClick={onToggleLayout}
          label={split ? "Show inline diff" : "Show side-by-side diff"}
          icon={split ? "Rows2" : "Columns2"}
        />
      </div>
      {query.error ? (
        <div role="alert" className="review-message review-error">
          {query.error.message}
        </div>
      ) : null}
      {query.isPending ? <div className="review-message">Loading diff…</div> : null}
      {query.data?.notice ? <div className="review-notice">{query.data.notice}</div> : null}
      {view && view.rows.length > 0 ? (
        <JayJayDiff view={view} split={split} showAll={() => setShowAll(true)} />
      ) : null}
    </section>
  );
}
