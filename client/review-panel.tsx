import { useMemo, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "react-native";
import {
  useRpc,
  useTabState,
  useWorkspace,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { z } from "zod";
import { repositoriesRpc, repositorySelectionSchema } from "../shared/repositories.js";
import {
  reviewFileRpc,
  reviewOpenRpc,
  type ReviewFile,
  type ReviewSnapshot,
  reviewTargetSchema,
  reviewTargetLabel,
  branchReview,
  type ReviewTarget,
} from "../shared/review.js";
import { DiffPane } from "./vendor/jayjay/components/diff/DiffPane.js";
import { diffCss } from "./vendor/jayjay/styles.js";
import { reviewCss } from "./review-styles.js";
import { collapseContext } from "./review-context.js";
import { inlineDiff } from "./review-layout.js";
import { ChangeList } from "./change-list.js";
import { ReviewFiles } from "./review-files.js";
import { historyLimit, maxHistoryLimit } from "../shared/history.js";

const stateSchema = z
  .object({
    repository: repositorySelectionSchema.default("."),
    path: z.string().nullable().default(null),
    diffLayout: z.enum(["split", "inline"]).default("split"),
    filesLayout: z.enum(["flat", "tree"]).default("flat"),
    target: reviewTargetSchema.default(branchReview),
    generation: z.number().int().nonnegative().default(0),
    historyLimit: z.number().int().min(historyLimit).max(maxHistoryLimit).default(historyLimit),
  })
  .readonly();
const labels = {
  before: "Before",
  after: "After",
  added: "Added",
  removed: "Removed",
  eof: "No newline at end of file",
  empty: "No textual changes",
  showAll: "Show all",
};

export function ReviewPanel(props: PluginWorkspacePanelProps) {
  const directory = useWorkspace(props.workspaceId, (workspace) => workspace.directory);
  const workspaceName = useWorkspace(props.workspaceId, (workspace) => workspace.name);
  if (props.layout.platform !== "web")
    return <Text>Review is available in Paseo on desktop and web.</Text>;
  return (
    <Review
      key={`${props.host.id}:${props.workspaceId}:${directory}`}
      {...props}
      directory={directory}
      workspaceName={workspaceName ?? ""}
    />
  );
}

function Review({
  theme,
  host,
  workspaceId,
  tab,
  directory,
  workspaceName,
}: PluginWorkspacePanelProps & {
  readonly directory: string | null;
  readonly workspaceName: string;
}) {
  const [tabState, setState] = useTabState(tab, stateSchema, {
    repository: ".",
    path: null,
    diffLayout: "split",
    filesLayout: "flat",
    target: branchReview,
    generation: 0,
    historyLimit,
  });
  const queryClient = useQueryClient();
  const [copySide, setCopySide] = useState<"old" | "new" | null>(null);
  const listRepositories = useRpc(repositoriesRpc);
  const open = useRpc(reviewOpenRpc);
  const repositories = useQuery({
    queryKey: ["jj-repositories", host.id, workspaceId, directory],
    queryFn: () => listRepositories({ workspaceId }),
    enabled: directory !== null,
    refetchInterval: 10_000,
    retry: false,
  });
  const repository = repositories.data?.some((entry) => entry.id === tabState.repository)
    ? tabState.repository
    : ".";
  const state =
    repository === tabState.repository
      ? tabState
      : { ...tabState, repository, target: branchReview, path: null, historyLimit };
  const comparison = useQuery({
    queryKey: [
      "jj-review-v4",
      host.id,
      workspaceId,
      directory,
      repository,
      state.target,
      state.generation,
    ],
    queryFn: () => open({ workspaceId, repository, target: state.target }),
    enabled: repositories.isSuccess && repositories.data.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
  const data = comparison.data;
  const comparisonLabel = data?.snapshot.label ?? reviewTargetLabel(state.target);
  const file = data?.files.find((entry) => entry.path === state.path) ?? data?.files[0];
  const { colors } = theme;
  const variables = {
    "--jj-page": colors.surface0,
    "--jj-surface": colors.surface1,
    "--review-hover": colors.surface2,
    "--jj-ink": colors.foreground,
    "--jj-muted": colors.foregroundMuted,
    "--jj-border": colors.border,
    "--jj-accent": colors.accent,
    "--jj-added-ink": colors.statusSuccess,
    "--jj-removed-ink": colors.statusDanger,
    "--jj-added-bg": `color-mix(in srgb, ${colors.statusSuccess} 12%, ${colors.surface0})`,
    "--jj-removed-bg": `color-mix(in srgb, ${colors.statusDanger} 12%, ${colors.surface0})`,
    "--jj-mono": "var(--fontFamily-mono, ui-monospace, SFMono-Regular, Consolas, monospace)",
  } as CSSProperties;
  const select = (target: ReviewTarget) => {
    setState({ ...state, target, path: null, generation: state.generation + 1 });
  };
  const refresh = () => {
    void repositories.refetch();
    void queryClient.invalidateQueries({ queryKey: ["jj-history", host.id, workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["jj-bookmarks", host.id, workspaceId] });
    if (repositories.isSuccess && repositories.data.length > 0) void comparison.refetch();
  };
  return (
    <div
      className="paseo-jj-review jayjay-review"
      style={variables}
      data-copy-side={copySide ?? undefined}
      data-diff-layout={state.diffLayout}
      onPointerDownCapture={(event) => {
        if (state.diffLayout !== "split") return;
        const target =
          event.target instanceof Element ? event.target.closest(".jj-diff-cell") : null;
        const side = target ? (target.previousElementSibling ? "new" : "old") : null;
        // A DOM selection crosses both columns, even when CSS excludes one from copying.
        if (side && side !== copySide)
          event.currentTarget.ownerDocument.getSelection()?.removeAllRanges();
        setCopySide(side);
      }}
    >
      <style>{diffCss + reviewCss}</style>
      <header className="review-toolbar">
        <div className="review-toolbar-start">
          <span className="review-title">jj companion</span>
          {repositories.data && repositories.data.length > 1 ? (
            <select
              aria-label="Review repository"
              value={repository}
              onChange={(event) =>
                setState({
                  ...state,
                  repository: event.target.value,
                  path: null,
                  target: branchReview,
                  historyLimit,
                  generation: state.generation + 1,
                })
              }
            >
              {repositories.data.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <button
          onClick={refresh}
          disabled={comparison.isFetching || repositories.isFetching}
          aria-label="Refresh review snapshot"
        >
          {comparison.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      <div className="review-layout">
        <aside className="review-changes" aria-label="Change history">
          <ChangeList
            key={repository}
            theme={theme}
            hostId={host.id}
            workspaceId={workspaceId}
            directory={directory}
            workspaceName={workspaceName}
            repository={repository}
            enabled={repositories.isSuccess && repositories.data.length > 0}
            target={state.target}
            snapshot={data?.snapshot}
            limit={state.historyLimit}
            onLimit={(historyLimit) => setState({ ...state, historyLimit })}
            onSelect={select}
          />
        </aside>
        <div className="review-body">
          {data && data.files.length > 0 ? (
            <ReviewFiles
              key={repository}
              files={data.files}
              layout={state.filesLayout}
              selectedPath={file?.path ?? null}
              onSelect={(path) => setState({ ...state, repository, path })}
              onToggleLayout={() =>
                setState({
                  ...state,
                  filesLayout: state.filesLayout === "flat" ? "tree" : "flat",
                })
              }
            />
          ) : null}
          <div className="review-document">
            {data?.snapshot.change ? (
              <ChangeDescription change={data.snapshot.change} />
            ) : (
              <div className="review-comparison-caption" title={comparisonLabel}>
                {comparisonLabel}
              </div>
            )}
            {repositories.error || comparison.error ? (
              <div role="alert" className="review-refresh-error review-error">
                {(repositories.error ?? comparison.error)?.message}
              </div>
            ) : null}
            {repositories.isSuccess && repositories.data.length === 0 ? (
              <div className="review-message">Open a jj workspace to review its changes.</div>
            ) : !data && !repositories.error && !comparison.error ? (
              <div className="review-message">Loading review…</div>
            ) : null}
            {data && data.files.length === 0 ? (
              <div className="review-message">No changes in this comparison.</div>
            ) : null}
            {data && file ? (
              <FilePane
                key={`${data.snapshot.operation}:${file.path}`}
                hostId={host.id}
                workspaceId={workspaceId}
                repository={repository}
                snapshot={data.snapshot}
                file={file}
                split={state.diffLayout === "split"}
                onToggleLayout={() => {
                  setCopySide(null);
                  setState({
                    ...state,
                    diffLayout: state.diffLayout === "split" ? "inline" : "split",
                  });
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangeDescription({ change }: { readonly change: NonNullable<ReviewSnapshot["change"]> }) {
  const [title, ...body] = change.description.trim().split("\n");
  return (
    <section className="review-change-description" aria-label="Change description">
      <h2>{title || "(no description)"}</h2>
      {body.some((line) => line.trim()) ? <p>{body.join("\n").trim()}</p> : null}
      <div className="review-change-meta">
        <span>{change.author || "Unknown author"}</span>
        <time dateTime={change.timestamp}>{new Date(change.timestamp).toLocaleString()}</time>
        <code data-pmono="" title={change.commitId}>
          {change.changeId.slice(0, 12)} · {change.commitId.slice(0, 10)}
        </code>
        {change.hasConflict ? (
          <span className="review-error">This change has conflicts.</span>
        ) : null}
      </div>
    </section>
  );
}

function FilePane({
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
            +{complete.added} −{complete.removed}
          </span>
        ) : null}
        {hasContext ? (
          <button onClick={() => setShowAll(!showAll)}>
            {showAll ? "Collapse context" : "Show all"}
          </button>
        ) : null}
        <button
          onClick={onToggleLayout}
          aria-label={split ? "Show inline diff" : "Show side-by-side diff"}
          title={split ? "Show inline diff" : "Show side-by-side diff"}
        >
          {split ? "Inline" : "Side by side"}
        </button>
      </div>
      {query.error ? (
        <div role="alert" className="review-message review-error">
          {query.error.message}
        </div>
      ) : null}
      {query.isPending ? <div className="review-message">Loading diff…</div> : null}
      {query.data?.notice ? <div className="review-notice">{query.data.notice}</div> : null}
      {view && view.rows.length > 0 ? (
        <div className="review-code" data-pmono="">
          <DiffPane view={view} split={split} showAll={() => setShowAll(true)} labels={labels} />
        </div>
      ) : null}
    </section>
  );
}
