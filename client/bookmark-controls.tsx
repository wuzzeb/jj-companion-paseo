import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput, ScrollView } from "@getpaseo/plugin/client/react-native";
import type { BookmarkAction, BookmarkTarget } from "../shared/bookmarks.js";
import type { useBookmarks } from "./use-bookmarks.js";
import { BookmarkMenu, type BookmarkMenuTarget } from "./bookmark-menu.js";

export function BookmarkControls({
  actions,
  theme,
  workspaceName,
  menu,
  setMenu,
  createTarget,
  setCreateTarget,
}: {
  actions: ReturnType<typeof useBookmarks>;
  theme: PluginTheme;
  workspaceName: string;
  menu: BookmarkMenuTarget | null;
  setMenu(value: BookmarkMenuTarget | null): void;
  createTarget: BookmarkTarget | null;
  setCreateTarget(value: BookmarkTarget | null): void;
}) {
  const state = actions.state.data;
  const [remoteChoice, setRemoteChoice] = useState<string | null>(null);
  const [remotesOpen, setRemotesOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [branchChoice, setBranchChoice] = useState<string | null>(null);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const closeMenu = useCallback(() => setMenu(null), [setMenu]);
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
  const workspaceTarget = state
    ? { kind: "workspace" as const, workingCopyChangeId: state.workingCopy.changeId }
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
            {button("Manage Bookmarks", () => setManagerOpen(true))}
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
            {state.candidates.length === 0 ? (
              button("Create bookmark", () => setCreateTarget(workspaceTarget))
            ) : (
              <>
                {button("Tug", tug, !branch, actions.activeAction === "tug")}
                {button("Push", push, !branch, actions.activeAction === "push")}
              </>
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

      <Modal title="Bookmarks" open={managerOpen} onOpenChange={setManagerOpen}>
        <Modal.Content>
          {button("Create bookmark", () => {
            setManagerOpen(false);
            setCreateTarget(workspaceTarget);
          })}
          {state.bookmarks
            .filter((entry) => entry.remote !== "git")
            .map((bookmark) => (
              <View
                key={`${bookmark.name}@${bookmark.remote ?? ""}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  numberOfLines={2}
                  style={{ flex: 1, color: theme.colors.foreground, fontSize: 12 }}
                >
                  {bookmark.name}
                  {bookmark.remote
                    ? `@${bookmark.remote} · ${bookmark.tracked ? "tracked" : "untracked"}`
                    : bookmark.targets.length
                      ? ""
                      : " · deleted"}
                  {bookmark.conflict ? " · conflicted" : ""}
                </Text>
                {bookmark.remote === null && bookmark.targets.length > 0
                  ? button(
                      remote ? `Push to ${remote}` : "Choose remote…",
                      () => {
                        setManagerOpen(false);
                        if (remote)
                          run({
                            kind: "push",
                            remote,
                            subject: {
                              kind: "bookmark",
                              name: bookmark.name,
                              expectedTargets: bookmark.targets,
                            },
                          });
                        else setRemotesOpen(true);
                      },
                      bookmark.conflict,
                    )
                  : null}
              </View>
            ))}
        </Modal.Content>
      </Modal>

      {createTarget ? (
        <CreateBookmark
          key={`${createTarget.kind}:${"commitId" in createTarget ? createTarget.commitId : createTarget.workingCopyChangeId}`}
          theme={theme}
          target={createTarget}
          workspaceName={workspaceName}
          busy={actions.busy}
          close={() => setCreateTarget(null)}
          run={(action) => {
            run(action);
            setCreateTarget(null);
          }}
        />
      ) : null}
      {menu ? (
        <BookmarkMenu
          target={menu}
          theme={theme}
          remotes={remote ? [remote] : state.remotes}
          busy={actions.busy}
          close={closeMenu}
          push={(remote) => {
            setMenu(null);
            run({
              kind: "push",
              remote,
              subject: {
                kind: "bookmark",
                name: menu.bookmark.name,
                expectedTargets: menu.bookmark.targets,
              },
            });
          }}
        />
      ) : null}
    </>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  theme,
  loading = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  theme: PluginTheme;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 9,
        paddingVertical: 7,
        borderRadius: 5,
        backgroundColor: theme.colors.surface1,
        opacity: (disabled && !loading) || pressed ? 0.45 : 1,
      })}
    >
      <Text
        style={{
          color: theme.colors.foreground,
          fontSize: 11,
          opacity: loading ? 0 : 1,
        }}
      >
        {label}
      </Text>
      {loading ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="small" color={theme.colors.foreground} />
        </View>
      ) : null}
    </Pressable>
  );
}

function CreateBookmark({
  theme,
  target,
  workspaceName,
  busy,
  close,
  run,
}: {
  theme: PluginTheme;
  target: BookmarkTarget;
  workspaceName: string;
  busy: boolean;
  close(): void;
  run(action: BookmarkAction): void;
}) {
  const [name, setName] = useState(workspaceName.replace(/[^A-Za-z0-9._/-]/g, "-"));
  const create = () => {
    if (busy || !name.trim()) return;
    run({ kind: "create", name: name.trim(), target, publish: false });
  };
  return (
    <Modal
      title="Create bookmark"
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Content>
        <TextInput
          accessibilityLabel="Bookmark name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={create}
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            color: theme.colors.foreground,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 5,
            padding: 10,
          }}
        />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {target.kind === "workspace"
            ? "Create at this workspace’s tip."
            : `Create at ${target.changeId.slice(0, 8)}.`}{" "}
          Use Push separately when you’re ready.
        </Text>
        <ActionButton
          theme={theme}
          label="Create bookmark"
          disabled={busy || !name.trim()}
          onPress={create}
        />
      </Modal.Content>
    </Modal>
  );
}
