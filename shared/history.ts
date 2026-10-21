import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const historyLimit = 200;
export const maxHistoryLimit = 1000;

export const changeSchema = z.object({
  commitId: z.string(),
  changeId: z.string(),
  parents: z.array(z.string()),
  description: z.string(),
  author: z.string(),
  timestamp: z.string(),
  bookmarks: z.array(z.string()),
  workspaces: z.array(z.string()),
  isWorkingCopy: z.boolean(),
  isImmutable: z.boolean(),
  isEmpty: z.boolean(),
  hasConflict: z.boolean(),
});

export type Change = z.infer<typeof changeSchema>;

export const historySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_jj") }),
  z.object({
    status: z.literal("ready"),
    root: z.string(),
    changes: z.array(changeSchema),
    hasMore: z.boolean(),
  }),
]);

export const historyRpc = defineRpc({
  name: "history.list",
  input: z.object({
    workspaceId: z.string().min(1),
    limit: z.number().int().min(1).max(maxHistoryLimit).default(historyLimit),
  }),
  output: historySchema,
});
