import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const nonColocatedWorkspaceKey = "jj-companion.nonColocatedWorkspace";

const bookmarkBaseSchema = z
  .object({ name: z.string().min(1), remote: z.string().nullable() })
  .readonly();
export type WorkspaceBookmarkBase = z.infer<typeof bookmarkBaseSchema>;
export const workspaceBaseSchema = z.union([z.literal("default"), bookmarkBaseSchema]);

export const jjWorkspaceOptionsRpc = defineRpc({
  name: "workspaces.options",
  input: z.object({ projectId: z.string().min(1) }),
  output: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("colocated") }).readonly(),
      z
        .object({
          kind: z.literal("non-colocated"),
          bookmarks: z.array(bookmarkBaseSchema).readonly(),
        })
        .readonly(),
    ])
    .nullable(),
});
