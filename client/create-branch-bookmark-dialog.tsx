import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Modal, TextInput } from "@getpaseo/plugin/client/ui";
import type { BookmarkOperation } from "../shared/bookmarks.js";
import type { useBookmarks } from "./use-bookmarks.js";
import { ActionButton } from "./action-button.js";

export function CreateBranchBookmarkDialog({
  actions,
  theme,
  suggestedName,
  onClose,
  onCreated,
}: {
  readonly actions: ReturnType<typeof useBookmarks>;
  readonly theme: PluginTheme;
  readonly suggestedName: string;
  readonly onClose: () => void;
  readonly onCreated: (name: string) => void;
}) {
  const [name, setName] = useState(suggestedName.replace(/[^A-Za-z0-9._/-]/g, "-"));
  const [creation, setCreation] = useState<{
    readonly name: string;
    readonly operation: BookmarkOperation | "starting";
  } | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const state = actions.state.data;
  const trimmed = name.trim();
  const exists = state?.bookmarks.some(
    (bookmark) => bookmark.remote === null && bookmark.name === trimmed,
  );
  const requested = creation?.operation;
  const operation =
    requested && requested !== "starting"
      ? actions.operation?.id === requested.id
        ? actions.operation
        : requested
      : null;
  const error =
    requestError ??
    (operation?.status === "failed" ? operation.message : creation ? actions.error : null);
  const busy =
    actions.busy ||
    requested === "starting" ||
    Boolean(operation && ["queued", "running"].includes(operation.status) && !error);
  useEffect(() => {
    if (creation && operation?.status === "succeeded") onCreated(creation.name);
  }, [creation, operation, onCreated]);
  const create = () => {
    if (!state || busy || !trimmed || exists) return;
    setRequestError(null);
    setCreation({ name: trimmed, operation: "starting" });
    void actions
      .run({
        kind: "create",
        name: trimmed,
        target: { kind: "workspace", workingCopyChangeId: state.workingCopy.changeId },
        publish: false,
      })
      .then((operation) => setCreation({ name: trimmed, operation }))
      .catch((error: unknown) => {
        setCreation(null);
        setRequestError(error instanceof Error ? error.message : String(error));
      });
  };
  return (
    <Modal
      title="Create Bookmark"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Content>
        <TextInput
          accessibilityLabel="New bookmark name"
          placeholder="New bookmark name"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={name}
          onChangeText={setName}
          onSubmitEditing={create}
          returnKeyType="done"
          maxLength={256}
          autoFocus
          selectTextOnFocus
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          style={{
            color: theme.colors.foreground,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 5,
            padding: 10,
          }}
        />
        {exists || error ? (
          <Text
            accessibilityRole="alert"
            selectable
            style={{ color: theme.colors.statusDanger, fontSize: 12 }}
          >
            {exists ? "A local bookmark with this name already exists." : error}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <ActionButton theme={theme} label="Cancel" onPress={onClose} />
          <ActionButton
            theme={theme}
            label="Create"
            onPress={create}
            disabled={!state || !trimmed || exists || busy}
            loading={busy}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}
