import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import type { Bookmark, BookmarkAction, BookmarkState } from "../shared/bookmarks.js";
import type { useBookmarks } from "./use-bookmarks.js";
import { ActionButton } from "./action-button.js";

type Actions = ReturnType<typeof useBookmarks>;

export function BookmarksDialog({
  actions,
  theme,
  open,
  onOpenChange,
  remote,
  onRemoteChange,
}: {
  readonly actions: Actions;
  readonly theme: PluginTheme;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly remote: string | null;
  readonly onRemoteChange: (remote: string) => void;
}) {
  const state = actions.state.data;
  if (!state) return null;
  const bookmarks = state.bookmarks.filter((bookmark) => bookmark.remote !== "git");
  const error = actions.busy
    ? null
    : (actions.error ??
      (actions.operation?.status === "failed" ? actions.operation.message : null));
  return (
    <Modal title="Bookmarks" open={open} onOpenChange={onOpenChange}>
      <Modal.Content scrollable={false} contentContainerStyle={{ gap: 12 }}>
        {state.remotes.length === 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            No Git remotes configured.
          </Text>
        ) : state.remotes.length > 1 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Push to</Text>
            {state.remotes.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="radio"
                accessibilityLabel={`Push to ${name}`}
                accessibilityState={{ checked: remote === name, disabled: actions.busy }}
                disabled={actions.busy}
                onPress={() => onRemoteChange(name)}
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 7,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderColor: remote === name ? theme.colors.accent : theme.colors.border,
                  backgroundColor: theme.colors.surface1,
                }}
              >
                <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 8 }}>
          {bookmarks.length === 0 ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              No bookmarks yet.
            </Text>
          ) : (
            bookmarks.map((bookmark) => (
              <BookmarkRow
                key={`${bookmark.name}@${bookmark.remote ?? ""}`}
                bookmark={bookmark}
                actions={actions}
                theme={theme}
                state={state}
                remote={remote}
              />
            ))
          )}
        </ScrollView>
        {error ? (
          <Text
            accessibilityRole="alert"
            selectable
            style={{ color: theme.colors.statusDanger, fontSize: 12 }}
          >
            {error}
          </Text>
        ) : null}
        <CreateBookmarkRow actions={actions} state={state} theme={theme} />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          Tug moves a bookmark to this workspace’s tip. Use the CLI to rename, delete, or resolve
          conflicts.
        </Text>
      </Modal.Content>
    </Modal>
  );
}

function BookmarkRow({
  bookmark,
  actions,
  theme,
  state,
  remote,
}: {
  readonly bookmark: Bookmark;
  readonly actions: Actions;
  readonly theme: PluginTheme;
  readonly state: BookmarkState;
  readonly remote: string | null;
}) {
  const run = (action: BookmarkAction) => {
    void actions.run(action).catch(() => {});
  };
  const pending = actions.pendingAction;
  const disabled = actions.busy || bookmark.conflict || bookmark.targets.length === 0;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Text
        selectable
        style={{ flex: 1, minWidth: 120, color: theme.colors.foreground, fontSize: 12 }}
      >
        {bookmark.name}
        {bookmark.remote ? `@${bookmark.remote}` : ""}
        {bookmark.remote ? ` · ${bookmark.tracked ? "tracked" : "untracked"}` : ""}
        {bookmark.targets.length === 0 ? " · deleted" : ""}
        {bookmark.conflict ? " · conflicted" : ""}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {bookmark.remote === null && bookmark.targets.length > 0 ? (
          <>
            <ActionButton
              theme={theme}
              label="Tug"
              accessibilityLabel={`Tug ${bookmark.name} to workspace tip`}
              disabled={disabled}
              loading={pending?.kind === "move" && pending.name === bookmark.name}
              onPress={() =>
                run({
                  kind: "move",
                  name: bookmark.name,
                  expectedTargets: bookmark.targets,
                  target: { kind: "workspace", workingCopyChangeId: state.workingCopy.changeId },
                })
              }
            />
            <ActionButton
              theme={theme}
              label={remote ? `Push to ${remote}` : "Push"}
              accessibilityLabel={`Push ${bookmark.name}${remote ? ` to ${remote}` : ""}`}
              disabled={disabled || !remote}
              loading={
                pending?.kind === "push" &&
                pending.subject.kind === "bookmark" &&
                pending.subject.name === bookmark.name
              }
              onPress={() => {
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
              }}
            />
          </>
        ) : bookmark.remote && !bookmark.tracked && bookmark.targets.length > 0 ? (
          <ActionButton
            theme={theme}
            label="Track"
            accessibilityLabel={`Track ${bookmark.name}@${bookmark.remote}`}
            disabled={disabled || !state.remotes.includes(bookmark.remote)}
            loading={
              pending?.kind === "track" &&
              pending.name === bookmark.name &&
              pending.remote === bookmark.remote
            }
            onPress={() => {
              if (bookmark.remote)
                run({ kind: "track", name: bookmark.name, remote: bookmark.remote });
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function CreateBookmarkRow({
  actions,
  state,
  theme,
}: {
  readonly actions: Actions;
  readonly state: BookmarkState;
  readonly theme: PluginTheme;
}) {
  const [name, setName] = useState("");
  const [creation, setCreation] = useState<{ readonly id: string; readonly name: string } | null>(
    null,
  );
  const trimmed = name.trim();
  const exists = state.bookmarks.some(
    (bookmark) => bookmark.remote === null && bookmark.name === trimmed,
  );
  useEffect(() => {
    const operation = actions.operation;
    if (
      !creation ||
      operation?.id !== creation.id ||
      !["succeeded", "failed"].includes(operation.status)
    )
      return;
    if (operation.status === "succeeded")
      setName((current) => (current.trim() === creation.name ? "" : current));
    setCreation(null);
  }, [creation, actions.operation]);
  const create = () => {
    if (actions.busy || !trimmed || exists) return;
    void actions
      .run({
        kind: "create",
        name: trimmed,
        target: { kind: "workspace", workingCopyChangeId: state.workingCopy.changeId },
        publish: false,
      })
      .then((operation) => setCreation({ id: operation.id, name: trimmed }))
      .catch(() => {});
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          accessibilityLabel="New bookmark name"
          placeholder="New bookmark name"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={name}
          onChangeText={setName}
          onSubmitEditing={create}
          returnKeyType="done"
          maxLength={256}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            minWidth: 0,
            color: theme.colors.foreground,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 5,
            padding: 10,
          }}
        />
        {trimmed ? (
          <ActionButton
            theme={theme}
            label="Create"
            onPress={create}
            disabled={actions.busy || exists}
            loading={actions.pendingAction?.kind === "create"}
          />
        ) : null}
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
        {exists
          ? "A local bookmark with this name already exists."
          : "Create locally at this workspace’s tip, then Push when ready."}
      </Text>
    </View>
  );
}
