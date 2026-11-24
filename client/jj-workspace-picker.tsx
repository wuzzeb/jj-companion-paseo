import { useNewWorkspace, useRpc } from "@getpaseo/plugin/client";
import { Combobox, Toggle } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import {
  jjWorkspaceOptionsRpc,
  nonColocatedWorkspaceKey,
  workspaceBaseSchema,
  type WorkspaceBookmarkBase,
} from "../shared/workspaces.js";

const local = { id: "local", label: "Local", description: "Use the current checkout", base: null };
const parents = { id: "parents", label: "New from checkout parents", base: "default" as const };

function bookmarkOption(base: WorkspaceBookmarkBase) {
  const name = base.remote === null ? base.name : `${base.name}@${base.remote}`;
  return { id: JSON.stringify([base.name, base.remote]), label: `New from ${name}`, base };
}

export function JjWorkspacePicker() {
  const { host, project, metadata, setMetadata } = useNewWorkspace();
  const getOptions = useRpc(jjWorkspaceOptionsRpc);
  const { data: options } = useQuery({
    queryKey: ["jj-workspace-options", host.id, project?.id],
    queryFn: project ? () => getOptions({ projectId: project.id }) : undefined,
    enabled: project !== null,
    retry: false,
  });
  if (!options) return null;

  const base = workspaceBaseSchema.safeParse(metadata[nonColocatedWorkspaceKey]).data;
  if (options.kind === "colocated") {
    return (
      <Toggle
        title="Non-colocated jj workspace"
        icon="GitBranch"
        value={base !== undefined}
        onValueChange={({ value }) =>
          setMetadata({ [nonColocatedWorkspaceKey]: value ? "default" : null })
        }
      />
    );
  }

  const selection =
    base === undefined ? local : base === "default" ? parents : bookmarkOption(base);
  return (
    <Combobox
      title="jj workspace"
      icon="GitBranch"
      value={selection}
      search={async ({ query }) => {
        const filter = query.trim().toLowerCase();
        return [local, parents, ...options.bookmarks.map(bookmarkOption)].filter(({ label }) =>
          label.toLowerCase().includes(filter),
        );
      }}
      onSelect={({ item }) => setMetadata({ [nonColocatedWorkspaceKey]: item.base })}
    />
  );
}
