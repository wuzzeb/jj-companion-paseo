import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import type { BookmarkAction } from "../shared/bookmarks.js";
import type { useBookmarks } from "./use-bookmarks.js";
import { ActionButton } from "./action-button.js";
import { BookmarksDialog } from "./bookmarks-dialog.js";
import { CreateBranchBookmarkDialog } from "./create-branch-bookmark-dialog.js";

export function BookmarkControls({
  actions,
  theme,
  onDiff,
  suggestedName,
}: {
  readonly actions: ReturnType<typeof useBookmarks>;
  readonly theme: PluginTheme;
  readonly onDiff: () => void;
  readonly suggestedName: string;
}) {
  const state = actions.state.data;
  const [remoteChoice, setRemoteChoice] = useState<string | null>(null);
  const [remotesOpen, setRemotesOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [branchChoice, setBranchChoice] = useState<string | null>(null);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const branch = state?.candidates.includes(branchChoice ?? "")
    ? branchChoice
    : state?.candidates.length === 1
      ? state.candidates[0]
      : null;
  const remote = state?.remotes.includes(remoteChoice ?? "")
    ? remoteChoice
    : state?.remotes.length === 1
      ? state.remotes[0]
      : null;
  const run = (action: BookmarkAction) => {
    void actions.run(action).catch(() => {});
  };
  const button = (label: string, onPress: () => void, disabled = false, loading = false) => (
    <ActionButton
      theme={theme}
      label={label}
      onPress={onPress}
      disabled={actions.busy || disabled}
      loading={loading}
    />
  );
  if (!state)
    return actions.state.error ? (
      <Text style={{ color: theme.colors.statusDanger, fontSize: 11, padding: 10 }}>
        {actions.state.error.message}
      </Text>
    ) : null;
  const push = () => {
    if (!branch) return;
    if (!remote) {
      setRemotesOpen(true);
      return;
    }
    run({
      kind: "push",
      remote,
      subject: {
        kind: "workspace",
        workingCopyChangeId: state.workingCopy.changeId,
        bookmarkName: branch,
        expectedTargets:
          state.bookmarks.find((entry) => entry.remote === null && entry.name === branch)
            ?.targets ?? [],
      },
    });
  };
  const tug = () => {
    if (!branch) return;
    run({
      kind: "tug",
      workingCopyChangeId: state.workingCopy.changeId,
      name: branch,
    });
  };
  return (
    <>
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 6,
          gap: 5,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
        testID="jj-bookmark-controls"
      >
        <View
          testID="jj-repository-controls"
          style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
        >
          <Pressable
            onPress={() => setRemotesOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Choose Git remote${remote ? `: ${remote}` : ""}`}
            style={{ flex: 1, minWidth: 0, paddingVertical: 3 }}
          >
            <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 11 }}>
              Remote: {remote ?? "Select…"} ▾
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 5, flexShrink: 0 }}>
            {button(
              "Fetch",
              () => {
                if (remote) run({ kind: "fetch", remote });
                else setRemotesOpen(true);
              },
              false,
              actions.activeAction === "fetch",
            )}
            {button("Bookmarks", () => setManagerOpen(true))}
          </View>
        </View>
        <View
          testID="jj-branch-controls"
          style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
        >
          {state.candidates.length > 1 ? (
            <Pressable
              onPress={() => setBranchesOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Choose branch bookmark${branch ? `: ${branch}` : ""}`}
              accessibilityState={{ disabled: actions.busy, expanded: branchesOpen }}
              disabled={actions.busy}
              style={{
                flex: 1,
                minWidth: 0,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                padding: 6,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 5,
                opacity: actions.busy ? 0.45 : 1,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ color: theme.colors.foreground, fontSize: 11, flex: 1 }}
              >
                {branch ?? "Select branch bookmark…"}
              </Text>
              <Icon name="ChevronDown" size={12} color={theme.colors.foregroundMuted} />
            </Pressable>
          ) : (
            <Text
              numberOfLines={1}
              style={{ color: theme.colors.foreground, fontSize: 11, flex: 1, minWidth: 0 }}
            >
              {branch ?? "No Branch Bookmark"}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 5, flexShrink: 0 }}>
            <ActionButton
              theme={theme}
              label="Diff"
              accessibilityLabel="Diff branch changes"
              onPress={onDiff}
            />
            {state.candidates.length > 0 ? (
              <>
                {button("Tug", tug, !branch, actions.activeAction === "tug")}
                {button("Push", push, !branch, actions.activeAction === "push")}
              </>
            ) : (
              button("Create Bookmark", () => setCreateOpen(true))
            )}
          </View>
        </View>
        {!actions.busy && (actions.error || actions.operation?.status === "failed") ? (
          <ScrollView style={{ maxHeight: 90 }}>
            <Text selectable style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
              {actions.error ?? actions.operation?.message}
            </Text>
          </ScrollView>
        ) : null}
      </View>

      <Modal title="Branch bookmark" open={branchesOpen} onOpenChange={setBranchesOpen}>
        <Modal.Content>
          <Text style={{ color: theme.colors.foregroundMuted }}>
            Choose the branch bookmark for Tug and Push.
          </Text>
          {state.candidates.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityState={{ checked: branch === name, disabled: actions.busy }}
              disabled={actions.busy}
              onPress={() => {
                setBranchChoice(name);
                setBranchesOpen(false);
              }}
              style={{
                padding: 10,
                borderRadius: 5,
                backgroundColor: theme.colors.surface1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text style={{ color: theme.colors.foreground, flex: 1 }}>{name}</Text>
              {branch === name ? (
                <Icon name="Check" size={15} color={theme.colors.foreground} />
              ) : null}
            </Pressable>
          ))}
        </Modal.Content>
      </Modal>

      <Modal title="Git remote" open={remotesOpen} onOpenChange={setRemotesOpen}>
        <Modal.Content>
          {state.remotes.length === 0 ? (
            <Text style={{ color: theme.colors.foregroundMuted }}>
              No Git remotes are configured for this repository.
            </Text>
          ) : (
            state.remotes.map((name) => (
              <ActionButton
                key={name}
                theme={theme}
                label={name}
                onPress={() => {
                  setRemoteChoice(name);
                  setRemotesOpen(false);
                }}
              />
            ))
          )}
        </Modal.Content>
      </Modal>

      <BookmarksDialog
        actions={actions}
        theme={theme}
        open={managerOpen}
        onOpenChange={setManagerOpen}
        remote={remote}
        onRemoteChange={setRemoteChoice}
      />
      {createOpen ? (
        <CreateBranchBookmarkDialog
          actions={actions}
          theme={theme}
          suggestedName={suggestedName}
          onClose={() => setCreateOpen(false)}
          onCreated={(name) => {
            setBranchChoice(name);
            setCreateOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
