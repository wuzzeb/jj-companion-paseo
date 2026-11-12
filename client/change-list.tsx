import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Pressable, Text, View, Platform, StyleSheet } from "react-native";
import { useRpc, useWorkspace, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { FlatList, Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { historyLimit, historyRpc, maxHistoryLimit, type Change } from "../shared/history.js";
import { linearRange } from "../shared/linear-range.js";
import { branchReview, type ReviewSnapshot, type ReviewTarget } from "../shared/review.js";
import { layoutGraph, resolveSelection, rowHeight } from "./graph.js";
import { GraphRail } from "./graph-rail.js";
import { useBookmarks } from "./use-bookmarks.js";
import { BookmarkControls } from "./bookmark-controls.js";
import { BookmarkChip } from "./bookmark-chip.js";
import { ChangeRow } from "./change-row.js";
import type { Bookmark } from "../shared/bookmarks.js";

const mono = Platform.OS === "ios" ? "Menlo" : "monospace";
const revision = ({ commitId, changeId }: Change) => ({ commitId, changeId });

export function ChangeList({
  theme,
  hostId,
  workspaceId,
  directory,
  repository,
  enabled,
  target,
  snapshot,
  limit,
  onLimit,
  onSelect,
  headerControls,
}: {
  readonly theme: PluginWorkspacePanelProps["theme"];
  readonly hostId: string;
  readonly workspaceId: string;
  readonly directory: string | null;
  readonly repository: string;
  readonly enabled: boolean;
  readonly target: ReviewTarget;
  readonly snapshot: ReviewSnapshot | undefined;
  readonly limit: number;
  readonly onLimit: (limit: number) => void;
  readonly onSelect: (target: ReviewTarget) => void;
  readonly headerControls: ReactNode;
}) {
  const [width, setWidth] = useState(320);
  const workspaceName = useWorkspace(workspaceId, (workspace) => workspace.name);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  useEffect(() => setSelectionError(null), [target]);
  const bookmarks = useBookmarks(workspaceId, hostId, directory, repository, enabled);
  const listHistory = useRpc(historyRpc);
  const query = useQuery({
    queryKey: ["jj-history", hostId, workspaceId, directory, repository, limit],
    queryFn: () => listHistory({ workspaceId, limit, repository }),
    refetchInterval: 10_000,
    retry: false,
    placeholderData: keepPreviousData,
    enabled,
  });
  const history = query.data?.status === "ready" ? query.data : null;
  const graph = useMemo(() => layoutGraph(history?.changes ?? []), [history?.changes]);
  const identity = target.kind === "selection" ? target.anchor : snapshot?.change;
  const selected = identity && history ? resolveSelection(history.changes, identity) : null;
  const end =
    target.kind === "selection" && target.end && history
      ? resolveSelection(history.changes, target.end)
      : null;
  const highlighted = useMemo(() => {
    const range =
      selected && end && history
        ? linearRange(history.changes, selected.commitId, end.commitId)
        : null;
    return new Set(
      range
        ? range.map((change) => change.commitId)
        : snapshot?.comparison.kind === "revisions"
          ? snapshot.comparison.revisions
          : selected
            ? [selected.commitId]
            : [],
    );
  }, [selected, end, history, snapshot]);
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

  return (
    <View
      style={styles.panel}
      testID="jj-change-list"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <View style={styles.toolbar}>
        <Icon name="GitGraph" size={15} color={theme.colors.foregroundMuted} />
        <Text style={styles.title}>Changes</Text>
        {headerControls}
      </View>
      {history ? (
        <BookmarkControls
          actions={bookmarks}
          theme={theme}
          onDiff={() => onSelect(branchReview)}
          suggestedName={workspaceName ?? ""}
        />
      ) : null}
      {query.error ? (
        <View style={styles.message} accessibilityRole="alert">
          <Text style={styles.error}>Couldn’t load jj history</Text>
          <Text style={styles.muted}>{query.error.message}</Text>
          <Pressable
            onPress={() => {
              void query.refetch();
            }}
            accessibilityRole="button"
            style={styles.retry}
          >
            <Text style={styles.accent}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {enabled && query.isPending ? <Text style={styles.messageText}>Loading history…</Text> : null}
      {query.data?.status === "not_jj" ? (
        <Text style={styles.messageText}>No jj repository.</Text>
      ) : null}
      {selectionError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {selectionError}
        </Text>
      ) : null}
      {history ? (
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
                  onSelect={(extend) => {
                    const anchor = extend && selected ? selected : change;
                    if (
                      anchor.commitId !== change.commitId &&
                      !linearRange(history.changes, anchor.commitId, change.commitId)
                    ) {
                      setSelectionError(
                        "Choose changes on the same linear stack. Load older history if the path is incomplete.",
                      );
                      return;
                    }
                    setSelectionError(null);
                    onSelect({
                      kind: "selection",
                      anchor: revision(anchor),
                      ...(anchor.commitId === change.commitId ? {} : { end: revision(change) }),
                    });
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
                        />
                      ))}
                      {!bookmarks.state.data && change.bookmarks.length > 0 ? (
                        <span className="review-bookmark-chip" title={change.bookmarks.join(" · ")}>
                          {change.bookmarks.join(" · ")}
                        </span>
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
                  onPress={() => onLimit(Math.min(limit + historyLimit, maxHistoryLimit))}
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
      height: 36,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      zIndex: 1,
    },
    title: { flexShrink: 0, color: colors.foreground, fontSize: 12, fontWeight: "500" },
    muted: { color: colors.foregroundMuted, fontSize: 11, lineHeight: 17 },
    accent: { color: colors.foreground, fontSize: 12, fontWeight: "500" },
    error: { color: colors.statusDanger, fontSize: 12 },
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
    workspaceRef: { color: colors.statusSuccess, fontSize: 11, flexShrink: 1 },
    summary: { color: colors.foreground, fontSize: 12, lineHeight: 17 },
    meta: { flexDirection: "row", alignItems: "center", gap: 7 },
    commitId: { color: colors.foregroundMuted, fontFamily: mono, fontSize: 10 },
    author: { color: colors.foregroundMuted, fontSize: 10, flexShrink: 1 },
    date: { color: colors.foregroundMuted, fontSize: 10, marginLeft: "auto" },
    loadMore: { padding: 16, alignItems: "center" },
    message: { padding: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    retry: { alignSelf: "flex-start", paddingVertical: 4 },
    messageText: { color: colors.foregroundMuted, padding: 16, fontSize: 12 },
  });
}
