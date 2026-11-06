import { useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Pressable, Text, View, Platform, StyleSheet } from "react-native";
import { z } from "zod";
import {
  useRpc,
  useTabState,
  useWorkspace,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { FlatList, Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { repositoriesRpc, repositorySelectionSchema } from "../shared/repositories.js";
import { RepositoryPicker } from "./repository-picker.js";
import { historyLimit, historyRpc, maxHistoryLimit, type Change } from "../shared/history.js";
import { linearRange } from "../shared/linear-range.js";
import { branchReview, type ReviewTarget } from "../shared/review.js";
import { layoutGraph, resolveSelection, rowHeight } from "./graph.js";
import { GraphRail } from "./graph-rail.js";
import { useBookmarks } from "./use-bookmarks.js";
import { BookmarkControls } from "./bookmark-controls.js";
import { ReviewButton } from "./review-button.js";
import { BookmarkChip } from "./bookmark-chip.js";
import { ChangeRow } from "./change-row.js";
import type { BookmarkMenuTarget } from "./bookmark-menu.js";
import type { Bookmark, BookmarkTarget } from "../shared/bookmarks.js";

const mono = Platform.OS === "ios" ? "Menlo" : "monospace";
const selectionSchema = z
  .object({ commitId: z.string().min(1), changeId: z.string().min(1) })
  .readonly();
const revision = ({ commitId, changeId }: Change) => ({ commitId, changeId });
const historyTabStateSchema = z
  .object({
    repository: repositorySelectionSchema.default("."),
    limit: z.number().int().min(historyLimit).max(maxHistoryLimit),
    selection: selectionSchema.nullable(),
    rangeEnd: selectionSchema.nullable().default(null),
  })
  .readonly();

type OpenReview = (repository: string, target: ReviewTarget) => void;
export function HistoryPanel(
  props: PluginWorkspacePanelProps & { readonly openReview: OpenReview },
) {
  const directory = useWorkspace(props.workspaceId, (workspace) => workspace.directory);
  const workspaceName = useWorkspace(props.workspaceId, (workspace) => workspace.name);
  return (
    <History
      key={`${props.host.id}:${props.workspaceId}:${directory}`}
      {...props}
      directory={directory}
      workspaceName={workspaceName ?? ""}
    />
  );
}

function History({
  theme,
  host,
  workspaceId,
  tab,
  directory,
  workspaceName,
  layout,
  openReview,
}: PluginWorkspacePanelProps & {
  readonly directory: string | null;
  readonly workspaceName: string;
  readonly openReview: OpenReview;
}) {
  const [tabState, setTabState] = useTabState(tab, historyTabStateSchema, {
    repository: ".",
    limit: historyLimit,
    selection: null,
    rangeEnd: null,
  });
  const listRepositories = useRpc(repositoriesRpc);
  const repositories = useQuery({
    queryKey: ["jj-repositories", host.id, workspaceId, directory],
    queryFn: () => listRepositories({ workspaceId }),
    refetchInterval: 10_000,
    retry: false,
  });
  const repository = repositories.data?.some((entry) => entry.id === tabState.repository)
    ? tabState.repository
    : ".";
  const state =
    repository === tabState.repository
      ? tabState
      : { repository, limit: historyLimit, selection: null, rangeEnd: null };
  return (
    <RepositoryHistory
      key={repository}
      desktop={layout.platform === "web" && !layout.compact}
      openReview={(target) => openReview(repository, target)}
      theme={theme}
      host={host}
      workspaceId={workspaceId}
      directory={directory}
      workspaceName={workspaceName}
      tabState={state}
      setTabState={setTabState}
      enabled={repositories.isSuccess}
      repositoryError={repositories.error}
      refreshRepositories={() => {
        void repositories.refetch();
      }}
      repositoryPicker={
        repositories.data && repositories.data.length > 1 ? (
          <RepositoryPicker
            repositories={repositories.data}
            value={repository}
            theme={theme}
            onSelect={(repository) =>
              setTabState({ repository, limit: historyLimit, selection: null, rangeEnd: null })
            }
          />
        ) : null
      }
    />
  );
}

function RepositoryHistory({
  theme,
  host,
  workspaceId,
  directory,
  workspaceName,
  tabState,
  setTabState,
  enabled,
  repositoryError,
  refreshRepositories,
  repositoryPicker,
  desktop,
  openReview,
}: Pick<PluginWorkspacePanelProps, "theme" | "host" | "workspaceId"> & {
  readonly desktop: boolean;
  readonly openReview: (target: ReviewTarget) => void;
  readonly directory: string | null;
  readonly workspaceName: string;
  readonly tabState: z.infer<typeof historyTabStateSchema>;
  readonly enabled: boolean;
  readonly repositoryError: Error | null;
  readonly repositoryPicker: ReactNode;
  setTabState(state: z.infer<typeof historyTabStateSchema>): void;
  refreshRepositories(): void;
}) {
  const { limit, selection, repository, rangeEnd: endIdentity } = tabState;
  const [width, setWidth] = useState(320);
  const panelRef = useRef<View>(null);
  const [menu, setMenu] = useState<BookmarkMenuTarget | null>(null);
  const [createTarget, setCreateTarget] = useState<BookmarkTarget | null>(null);
  const bookmarks = useBookmarks(workspaceId, host.id, directory, repository, enabled);
  const listHistory = useRpc(historyRpc);
  const query = useQuery({
    queryKey: ["jj-history", host.id, workspaceId, directory, repository, limit],
    queryFn: () => listHistory({ workspaceId, limit, repository }),
    refetchInterval: 10_000,
    retry: false,
    placeholderData: keepPreviousData,
    enabled,
  });
  const history = query.data?.status === "ready" ? query.data : null;
  const changes = history?.changes;
  const graph = useMemo(() => layoutGraph(changes ?? []), [changes]);
  const selected = changes ? resolveSelection(changes, selection) : null;
  const end = changes && endIdentity ? resolveSelection(changes, endIdentity) : null;
  const range = useMemo(
    () =>
      selected && end && changes ? linearRange(changes, selected.commitId, end.commitId) : null,
    [selected, end, changes],
  );
  const reviewSelection: ReviewTarget | null = selected
    ? endIdentity
      ? {
          kind: "selection",
          anchor: revision(range?.at(-1) ?? selected),
          end: revision(range?.[0] ?? end ?? selected),
        }
      : { kind: "selection", anchor: revision(selected) }
    : null;
  const selectionError =
    endIdentity && !end
      ? "The other selected change is no longer in this history. Select the range again."
      : endIdentity && !range
        ? "Choose changes on the same linear stack. Load older history if the path is incomplete."
        : null;
  const highlighted = useMemo(
    () =>
      new Set([
        ...(range ?? []).map((change) => change.commitId),
        ...(selected ? [selected.commitId] : []),
        ...(end ? [end.commitId] : []),
      ]),
    [range, selected, end],
  );
  const refsByCommit = useMemo(() => {
    const entries = new Map<string, Bookmark[]>();
    for (const bookmark of bookmarks.state.data?.bookmarks ?? []) {
      if (bookmark.remote === "git") continue;
      const local = bookmarks.state.data?.bookmarks.find(
        (entry) => entry.remote === null && entry.name === bookmark.name,
      );
      if (
        bookmark.remote &&
        bookmark.tracked &&
        local &&
        local.targets.length === bookmark.targets.length &&
        bookmark.targets.every((id) => local.targets.includes(id))
      )
        continue;
      for (const commitId of bookmark.targets)
        entries.set(commitId, [...(entries.get(commitId) ?? []), bookmark]);
    }
    return entries;
  }, [bookmarks.state.data]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const refresh = () => {
    refreshRepositories();
    if (enabled) {
      void query.refetch();
      void bookmarks.state.refetch();
    }
  };
  const openBookmark = (bookmark: Bookmark, trigger: View | null) => {
    if (bookmarks.busy || bookmark.remote !== null || !trigger) return;
    trigger.measureInWindow((x, y, width, height) => {
      panelRef.current?.measureInWindow((panelX, panelY, panelWidth, panelHeight) => {
        setMenu({
          bookmark,
          trigger,
          anchor: { x: x - panelX, y: y - panelY, width, height },
          bounds: { width: panelWidth, height: panelHeight },
        });
      });
    });
  };

  return (
    <View
      ref={panelRef}
      style={styles.panel}
      testID="jj-history-panel"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        setMenu(null);
      }}
    >
      <View style={styles.toolbar}>
        <Icon name="GitGraph" size={15} color={theme.colors.foregroundMuted} />
        <Text style={[styles.title, repositoryPicker ? { flex: 0 } : null]}>History</Text>
        {repositoryPicker}
        {desktop ? (
          <ReviewButton
            theme={theme}
            target={branchReview}
            open={openReview}
            disabled={!history}
            iconOnly
          />
        ) : null}
        <Pressable
          onPress={refresh}
          disabled={query.isFetching}
          accessibilityRole="button"
          accessibilityLabel="Refresh jj history"
          accessibilityState={{ disabled: query.isFetching, busy: query.isFetching }}
          style={({ pressed }) => [
            styles.iconButton,
            { opacity: pressed || query.isFetching ? 0.4 : 1 },
          ]}
        >
          <Icon name="RotateCw" size={15} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>

      {history ? (
        <BookmarkControls
          actions={bookmarks}
          theme={theme}
          workspaceName={workspaceName}
          menu={menu}
          setMenu={setMenu}
          createTarget={createTarget}
          setCreateTarget={setCreateTarget}
        />
      ) : null}

      {query.error || repositoryError ? (
        <View style={styles.message} accessibilityRole="alert">
          <Text style={styles.error}>Couldn’t load jj history</Text>
          <Text style={styles.muted}>{(query.error ?? repositoryError)?.message}</Text>
          <Pressable onPress={refresh} accessibilityRole="button" style={styles.retry}>
            <Text style={styles.accent}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {query.isPending && !repositoryError ? (
        <Text style={styles.messageText}>Loading history…</Text>
      ) : null}
      {query.data?.status === "not_jj" ? (
        <View style={styles.empty}>
          <Icon name="GitGraph" size={28} color={theme.colors.foregroundMuted} />
          <Text style={styles.emptyTitle}>No jj repository</Text>
          <Text style={styles.muted}>
            Open a workspace inside a jj repository to browse its history.
          </Text>
        </View>
      ) : null}

      {history ? (
        <>
          <ScrollView
            horizontal
            style={styles.list}
            contentContainerStyle={{ width: Math.max(width, graph.width + 210) }}
          >
            <FlatList
              style={styles.list}
              data={history.changes}
              extraData={highlighted}
              keyExtractor={(change) => change.commitId}
              getItemLayout={(_, index) => ({
                length: rowHeight,
                offset: rowHeight * index,
                index,
              })}
              initialNumToRender={20}
              renderItem={({ item: change, index }) => {
                const active = highlighted.has(change.commitId);
                const summary =
                  change.description.split("\n")[0] ||
                  (change.parents.length === 0 ? "root()" : "(no description)");
                return (
                  <ChangeRow
                    change={change}
                    active={active}
                    theme={theme}
                    hostId={host.id}
                    workspaceId={workspaceId}
                    repository={repository}
                    disabled={bookmarks.busy}
                    onSelect={(extend) =>
                      setTabState({
                        ...tabState,
                        selection:
                          desktop && extend && selected ? revision(selected) : revision(change),
                        rangeEnd:
                          desktop && extend && selected && selected.commitId !== change.commitId
                            ? revision(change)
                            : null,
                      })
                    }
                    onMove={(bookmark, target) => {
                      void bookmarks
                        .run({
                          kind: "move",
                          name: bookmark.name,
                          expectedTargets: bookmark.targets,
                          target: {
                            kind: "change",
                            commitId: target.commitId,
                            changeId: target.changeId,
                          },
                        })
                        .catch(() => {});
                    }}
                  >
                    <GraphRail
                      row={graph.rows[index]}
                      width={graph.width}
                      change={change}
                      theme={theme}
                    />
                    <View style={styles.rowContent}>
                      <View style={styles.refs}>
                        <Text style={styles.changeId}>{change.changeId.slice(0, 8)}</Text>
                        {change.isWorkingCopy ? <Text style={styles.workspaceBadge}>@</Text> : null}
                        {change.hasConflict ? (
                          <Text style={styles.conflictBadge}>conflict</Text>
                        ) : null}
                        {(refsByCommit.get(change.commitId) ?? []).map((bookmark) => (
                          <BookmarkChip
                            key={`${bookmark.name}@${bookmark.remote ?? ""}`}
                            bookmark={bookmark}
                            hostId={host.id}
                            workspaceId={workspaceId}
                            repository={repository}
                            theme={theme}
                            disabled={bookmarks.busy}
                            onOpen={openBookmark}
                          />
                        ))}
                        {!bookmarks.state.data && change.bookmarks.length > 0 ? (
                          <Text style={styles.bookmark} numberOfLines={1}>
                            {change.bookmarks.join(" · ")}
                          </Text>
                        ) : null}
                        {!change.isWorkingCopy && change.workspaces.length > 0 ? (
                          <Text style={styles.workspaceRef} numberOfLines={1}>
                            {change.workspaces.join(", ")}@
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.summary, !change.description.trim() && styles.muted]}
                        numberOfLines={1}
                      >
                        {summary}
                      </Text>
                      <View style={styles.meta}>
                        <Text style={styles.commitId}>{change.commitId.slice(0, 8)}</Text>
                        <Text style={styles.author} numberOfLines={1}>
                          {change.author || (change.parents.length > 0 ? "Unknown author" : "")}
                        </Text>
                        <Text style={styles.date}>
                          {change.parents.length > 0 ? change.timestamp.slice(5, 10) : ""}
                        </Text>
                      </View>
                    </View>
                  </ChangeRow>
                );
              }}
              ListEmptyComponent={<Text style={styles.messageText}>No changes to show.</Text>}
              ListFooterComponent={
                history.hasMore ? (
                  <Pressable
                    onPress={() =>
                      setTabState({
                        ...tabState,
                        limit: Math.min(limit + historyLimit, maxHistoryLimit),
                      })
                    }
                    disabled={limit >= maxHistoryLimit || query.isFetching}
                    accessibilityRole="button"
                    style={styles.loadMore}
                  >
                    <Text style={limit >= maxHistoryLimit ? styles.muted : styles.accent}>
                      {limit >= maxHistoryLimit
                        ? `Showing ${maxHistoryLimit} changes`
                        : "Load older changes"}
                    </Text>
                  </Pressable>
                ) : null
              }
            />
          </ScrollView>

          {desktop && selected && endIdentity ? (
            <View style={styles.reviewControls}>
              <Text style={styles.accent}>
                {range
                  ? `${range.length} changes selected · ${range.at(-1)!.changeId.slice(0, 8)} → ${range[0].changeId.slice(0, 8)}`
                  : "Range selection"}
              </Text>
              <ReviewButton
                theme={theme}
                open={openReview}
                target={reviewSelection ?? branchReview}
                disabled={!!selectionError || !reviewSelection}
              />
              <Text style={selectionError ? styles.error : styles.muted}>
                {selectionError ?? "Click a change to clear the range."}
              </Text>
            </View>
          ) : null}

          {selected && (!desktop || !endIdentity) ? (
            <ScrollView style={styles.details} contentContainerStyle={styles.detailsContent}>
              <View style={styles.refs}>
                <Text style={styles.detailId}>{selected.changeId.slice(0, 12)}</Text>
                {selected.isWorkingCopy ? (
                  <Text style={styles.workspaceBadge}>Working copy</Text>
                ) : null}
                {selected.isEmpty ? <Text style={styles.muted}>empty</Text> : null}
                <View style={styles.detailActions}>
                  {desktop ? (
                    <ReviewButton
                      theme={theme}
                      open={openReview}
                      target={reviewSelection ?? branchReview}
                      disabled={!!selectionError || !reviewSelection}
                      iconOnly
                    />
                  ) : null}
                  <Pressable
                    onPress={() =>
                      setCreateTarget({
                        kind: "change",
                        commitId: selected.commitId,
                        changeId: selected.changeId,
                      })
                    }
                    disabled={bookmarks.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Create bookmark on selected change"
                    style={{ padding: 4 }}
                  >
                    <Icon name="BookmarkPlus" size={15} color={theme.colors.foregroundMuted} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.description} selectable>
                {selected.description.trim() ||
                  (selected.parents.length === 0 ? "root()" : "No description")}
              </Text>
              {selected.bookmarks.length > 0 ? (
                <Text style={styles.accent} selectable>
                  {selected.bookmarks.join(" · ")}
                </Text>
              ) : null}
              {selected.workspaces.length > 0 ? (
                <Text style={styles.workspaceRef}>{selected.workspaces.join(", ")}@</Text>
              ) : null}
              <Text style={styles.muted} selectable>
                {selected.author} · {new Date(selected.timestamp).toLocaleString()}
              </Text>
              <Text style={styles.fullCommitId} selectable>
                {selected.commitId}
              </Text>
              {selected.hasConflict ? (
                <Text style={styles.error}>This change has conflicts.</Text>
              ) : null}
            </ScrollView>
          ) : !selected && selection ? (
            <Text style={styles.messageText}>
              The selected change is no longer in this history.
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function createStyles({ colors }: PluginWorkspacePanelProps["theme"]) {
  return StyleSheet.create({
    panel: { flex: 1, minHeight: 0, backgroundColor: colors.surface0 },
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingLeft: 12,
      paddingRight: 4,
      height: 42,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      zIndex: 1,
    },
    title: { flex: 1, color: colors.foreground, fontSize: 12, fontWeight: "500" },
    muted: { color: colors.foregroundMuted, fontSize: 11, lineHeight: 17 },
    accent: { color: colors.foreground, fontSize: 12, fontWeight: "500" },
    error: { color: colors.statusDanger, fontSize: 12 },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 4,
    },
    list: { flex: 1, minHeight: 0 },
    rowContent: { flex: 1, minWidth: 0, paddingTop: 10, gap: 5 },
    refs: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 18 },
    changeId: { color: colors.foregroundMuted, fontFamily: mono, fontSize: 11 },
    workspaceBadge: {
      color: colors.statusSuccess,
      backgroundColor: colors.surface1,
      fontSize: 10,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      overflow: "hidden",
    },
    conflictBadge: { color: colors.statusDanger, fontSize: 10 },
    bookmark: {
      color: colors.foreground,
      backgroundColor: colors.surface1,
      fontSize: 10,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      flexShrink: 1,
    },
    workspaceRef: { color: colors.statusSuccess, fontSize: 11, flexShrink: 1 },
    summary: { color: colors.foreground, fontSize: 12, lineHeight: 17 },
    meta: { flexDirection: "row", alignItems: "center", gap: 7 },
    commitId: { color: colors.foregroundMuted, fontFamily: mono, fontSize: 10 },
    author: { color: colors.foregroundMuted, fontSize: 10, flexShrink: 1 },
    date: { color: colors.foregroundMuted, fontSize: 10, marginLeft: "auto" },
    details: {
      flexGrow: 0,
      maxHeight: "17.5%",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface1,
    },
    detailsContent: { padding: 12, gap: 7 },
    detailActions: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
    reviewControls: {
      padding: 8,
      gap: 4,
      alignItems: "flex-start",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface1,
    },
    detailId: { color: colors.foreground, fontFamily: mono, fontSize: 11 },
    description: { color: colors.foreground, fontSize: 12, lineHeight: 18 },
    fullCommitId: { color: colors.foregroundMuted, fontSize: 10, fontFamily: mono },
    loadMore: { padding: 16, alignItems: "center" },
    message: { padding: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    retry: { alignSelf: "flex-start", paddingVertical: 4 },
    messageText: { color: colors.foregroundMuted, padding: 16, fontSize: 12 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
    emptyTitle: { color: colors.foreground, fontSize: 14, fontWeight: "500" },
  });
}
