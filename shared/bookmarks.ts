import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const revisionSchema = z.object({
  commitId: z.string().regex(/^[0-9a-f]{40,64}$/),
  changeId: z.string().regex(/^[k-z]+$/),
});
export const bookmarkSchema = z.object({
  name: z.string(),
  remote: z.string().nullable(),
  tracked: z.boolean(),
  conflict: z.boolean(),
  targets: z.array(z.string()),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;
export const bookmarkStateSchema = z.object({
  bookmarks: z.array(bookmarkSchema),
  remotes: z.array(z.string()),
  workingCopy: revisionSchema,
  target: revisionSchema,
  usesParent: z.boolean(),
  candidates: z.array(z.string()),
});
export type BookmarkState = z.infer<typeof bookmarkStateSchema>;

const name = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) => [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
    "Invalid name",
  );
const expectedTargets = z.array(z.string());
const workspace = z.object({ kind: z.literal("workspace"), workingCopyChangeId: z.string() });
const change = revisionSchema.extend({ kind: z.literal("change") });
const target = z.discriminatedUnion("kind", [workspace, change]);
const subject = z.discriminatedUnion("kind", [
  workspace.extend({ bookmarkName: name.nullable(), expectedTargets }),
  z.object({ kind: z.literal("bookmark"), name, expectedTargets }),
]);
export const bookmarkActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    name,
    target,
    publish: z.boolean(),
    remote: name.optional(),
  }),
  z.object({ kind: z.literal("tug"), workingCopyChangeId: z.string(), name: name.optional() }),
  z.object({ kind: z.literal("push"), subject, remote: name }),
  z.object({ kind: z.literal("fetch"), remote: name }),
  z.object({ kind: z.literal("move"), name, expectedTargets, target }),
  z.object({ kind: z.literal("rename"), name, expectedTargets, newName: name }),
  z.object({ kind: z.literal("delete"), name, expectedTargets }),
  z.object({ kind: z.literal("track"), name, remote: name }),
  z.object({ kind: z.literal("untrack"), name, remote: name }),
]);
export type BookmarkAction = z.infer<typeof bookmarkActionSchema>;
export type BookmarkTarget = z.infer<typeof target>;

export const operationSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  message: z.string(),
});
export type BookmarkOperation = z.infer<typeof operationSchema>;
export const bookmarkStateRpc = defineRpc({
  name: "bookmarks.state",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: bookmarkStateSchema.nullable(),
});
export const bookmarkActionRpc = defineRpc({
  name: "bookmarks.start",
  input: z.object({ workspaceId: z.string().min(1), action: bookmarkActionSchema }),
  output: operationSchema,
});
export const bookmarkOperationRpc = defineRpc({
  name: "bookmarks.operation",
  input: z.object({ workspaceId: z.string().min(1), operationId: z.string() }),
  output: operationSchema,
});
