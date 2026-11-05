import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "../shared/review.js";
import { DiffPane } from "./vendor/jayjay/components/diff/DiffPane.js";
import { diffCss } from "./vendor/jayjay/styles.js";
import { reviewCss } from "./review-styles.js";
import { collapseContext } from "./review-context.js";

const stateSchema = z
  .object({
    repository: repositorySelectionSchema.default("."),
    path: z.string().nullable().default(null),
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
}: PluginWorkspacePanelProps & { readonly directory: string | null }) {
  const [state, setState] = useTabState(tab, stateSchema, { repository: ".", path: null });
  const [copySide, setCopySide] = useState<"old" | "new" | null>(null);
  const listRepositories = useRpc(repositoriesRpc);
  const open = useRpc(reviewOpenRpc);
  const repositories = useQuery({
    queryKey: ["jj-repositories", host.id, workspaceId, directory],
    queryFn: () => listRepositories({ workspaceId }),
    enabled: directory !== null,
    retry: false,
  });
  const repository = repositories.data?.some((entry) => entry.id === state.repository)
    ? state.repository
    : ".";
  const comparison = useQuery({
    queryKey: ["jj-review", host.id, workspaceId, directory, repository],
    queryFn: () => open({ workspaceId, repository }),
    enabled: repositories.isSuccess && repositories.data.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
  const data = comparison.data;
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
    "--jj-mono": "ui-monospace, SFMono-Regular, Consolas, monospace",
  } as CSSProperties;
  const refresh = () => {
    if (repositories.error) void repositories.refetch();
    else void comparison.refetch();
  };
  return (
    <div
      className="paseo-jj-review jayjay-review"
      style={variables}
      data-copy-side={copySide ?? undefined}
      onPointerDownCapture={(event) => {
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
        <span className="review-title">Review</span>
        {repositories.data && repositories.data.length > 1 ? (
          <select
            aria-label="Review repository"
            value={repository}
            onChange={(event) => setState({ repository: event.target.value, path: null })}
          >
            {repositories.data.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        ) : (
          <span>{repositories.data?.[0]?.label}</span>
        )}
        <span
          className="review-revisions"
          title={data ? `${data.snapshot.from} → ${data.snapshot.to}` : undefined}
        >
          {data
            ? `${data.snapshot.from.slice(0, 10)} → ${data.snapshot.to.slice(0, 10)}`
            : "fork_point(main|@) → @"}
        </span>
        <button
          onClick={refresh}
          disabled={comparison.isFetching || repositories.isFetching}
          aria-label="Refresh review snapshot"
        >
          {comparison.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>
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
        <div className="review-message">No changes from main’s fork point.</div>
      ) : null}
      {data && file ? (
        <div className="review-body">
          <nav className="review-files" aria-label="Changed files">
            <div className="review-file-count">
              {data.files.length} changed {data.files.length === 1 ? "file" : "files"}
            </div>
            {data.files.map((entry) => (
              <button
                key={entry.path}
                className="review-file"
                data-status={entry.status}
                aria-pressed={entry.path === file.path}
                title={
                  entry.oldPath === entry.path ? entry.path : `${entry.oldPath} → ${entry.path}`
                }
                onClick={() => setState({ repository, path: entry.path })}
              >
                <span className="review-status" aria-hidden="true">
                  {entry.status}
                </span>
                <span>{entry.path}</span>
              </button>
            ))}
          </nav>
          <FilePane
            key={`${data.snapshot.operation}:${file.path}`}
            hostId={host.id}
            workspaceId={workspaceId}
            repository={repository}
            snapshot={data.snapshot}
            file={file}
          />
        </div>
      ) : null}
    </div>
  );
}

function FilePane({
  hostId,
  workspaceId,
  repository,
  snapshot,
  file,
}: {
  readonly hostId: string;
  readonly workspaceId: string;
  readonly repository: string;
  readonly snapshot: ReviewSnapshot;
  readonly file: ReviewFile;
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
  const view = showAll ? complete : collapsed;
  return (
    <section className="review-file-pane" aria-label={`Diff for ${file.path}`}>
      <div className="review-file-header">
        <span className="review-path">
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
      </div>
      {query.error ? (
        <div role="alert" className="review-message review-error">
          {query.error.message}
        </div>
      ) : null}
      {query.isPending ? <div className="review-message">Loading diff…</div> : null}
      {query.data?.notice ? <div className="review-notice">{query.data.notice}</div> : null}
      {view && view.rows.length > 0 ? (
        <div className="review-code">
          <DiffPane view={view} split showAll={() => setShowAll(true)} labels={labels} />
        </div>
      ) : null}
    </section>
  );
}
