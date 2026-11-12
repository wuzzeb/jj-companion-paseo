import type { CSSProperties } from "react";
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
  reviewOpenRpc,
  type ReviewSnapshot,
  reviewTargetSchema,
  reviewTargetLabel,
  branchReview,
  type ReviewTarget,
} from "../shared/review.js";
import { FilePane } from "./review-file-pane.js";
import { reviewCss } from "./review-styles.js";
import { ChangeList } from "./change-list.js";
import { ReviewFiles } from "./review-files.js";
import { ResizableColumn, columnDividerWidth } from "./resizable-column.js";
import { IconButton } from "./icon-button.js";
import { historyLimit, maxHistoryLimit } from "../shared/history.js";

const minChangesWidth = 260;
const minFilesWidth = 140;
const minDiffWidth = 240;

const stateSchema = z
  .object({
    repository: repositorySelectionSchema.default("."),
    path: z.string().nullable().default(null),
    diffLayout: z.enum(["split", "inline"]).default("split"),
    filesLayout: z.enum(["flat", "tree"]).default("flat"),
    changesWidth: z.number().int().min(minChangesWidth).nullable().default(null),
    filesWidth: z.number().int().min(minFilesWidth).nullable().default(null),
    target: reviewTargetSchema.default(branchReview),
    generation: z.number().int().nonnegative().default(0),
    historyLimit: z.number().int().min(historyLimit).max(maxHistoryLimit).default(historyLimit),
  })
  .readonly();

export function ReviewPanel(props: PluginWorkspacePanelProps) {
  const directory = useWorkspace(props.workspaceId, (workspace) => workspace.directory);
  if (props.layout.platform !== "web")
    return <Text>Review is available in Paseo on desktop and web.</Text>;
  return (
    <Review
      key={`${props.host.id}:${props.workspaceId}:${directory}`}
      {...props}
      directory={directory}
    />
  );
}

function Review({
  theme,
  host,
  workspaceId,
  tab,
  directory,
}: PluginWorkspacePanelProps & {
  readonly directory: string | null;
}) {
  const [tabState, setState] = useTabState(tab, stateSchema, {
    repository: ".",
    path: null,
    diffLayout: "split",
    filesLayout: "flat",
    changesWidth: null,
    filesWidth: null,
    target: branchReview,
    generation: 0,
    historyLimit,
  });
  const queryClient = useQueryClient();
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
    "--review-page": colors.surface0,
    "--review-surface": colors.surface1,
    "--review-hover": colors.surface2,
    "--review-ink": colors.foreground,
    "--review-muted": colors.foregroundMuted,
    "--review-border": colors.border,
    "--review-accent": colors.accent,
    "--review-added-ink": colors.statusSuccess,
    "--review-removed-ink": colors.statusDanger,
    "--review-mono": "var(--fontFamily-mono, ui-monospace, SFMono-Regular, Consolas, monospace)",
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
    <div className="paseo-jj-review" style={variables}>
      <style>{reviewCss}</style>
      <div className="review-layout">
        <ResizableColumn
          className="review-changes"
          label="changes column"
          width={state.changesWidth}
          minWidth={minChangesWidth}
          minRemainingWidth={
            data && data.files.length > 0
              ? minFilesWidth + columnDividerWidth + minDiffWidth
              : minDiffWidth
          }
          onResize={(changesWidth) => setState({ ...state, changesWidth })}
        >
          <ChangeList
            key={repository}
            theme={theme}
            hostId={host.id}
            workspaceId={workspaceId}
            directory={directory}
            repository={repository}
            enabled={repositories.isSuccess && repositories.data.length > 0}
            target={state.target}
            snapshot={data?.snapshot}
            limit={state.historyLimit}
            onLimit={(historyLimit) => setState({ ...state, historyLimit })}
            onSelect={select}
            headerControls={
              <div className="review-history-controls">
                {repositories.data && repositories.data.length > 1 ? (
                  <select
                    className="review-repository-picker"
                    title={repositories.data.find((entry) => entry.id === repository)?.label}
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
                <IconButton
                  icon="RotateCw"
                  label="Refresh changes and diff"
                  onClick={refresh}
                  busy={comparison.isFetching || repositories.isFetching}
                />
              </div>
            }
          />
        </ResizableColumn>
        <div className="review-body">
          {data && data.files.length > 0 ? (
            <ResizableColumn
              className="review-files-column"
              label="files column"
              width={state.filesWidth}
              minWidth={minFilesWidth}
              minRemainingWidth={minDiffWidth}
              onResize={(filesWidth) => setState({ ...state, filesWidth })}
            >
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
            </ResizableColumn>
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
