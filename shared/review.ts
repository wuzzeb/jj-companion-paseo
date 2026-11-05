import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { repositoryInput } from "./repositories.js";

const commitId = z.string().regex(/^[0-9a-f]{40,64}$/);
export const reviewSnapshotSchema = z
  .object({
    root: z.string().min(1),
    operation: z.string().regex(/^[0-9a-f]{128}$/),
    from: commitId,
    to: commitId,
  })
  .readonly();
export type ReviewSnapshot = z.infer<typeof reviewSnapshotSchema>;
export const reviewFileSchema = z
  .object({ path: z.string(), oldPath: z.string(), status: z.string().length(1) })
  .readonly();
export type ReviewFile = z.infer<typeof reviewFileSchema>;
export const diffCellSchema = z
  .object({
    oldLine: z.union([z.number(), z.string(), z.null()]),
    newLine: z.number().nullable(),
    style: z.string(),
    spans: z
      .array(
        z
          .object({
            text: z.string(),
            style: z.string(),
            token: z.string(),
            tooltip: z.string().nullable(),
          })
          .readonly(),
      )
      .readonly(),
    noEofNewline: z.boolean(),
    anchor: z
      .object({ side: z.enum(["old", "new"]), line: z.number(), group: z.number() })
      .readonly()
      .nullable(),
  })
  .readonly();
export type DiffCell = z.infer<typeof diffCellSchema>;
export const diffViewSchema = z
  .object({
    language: z.string(),
    added: z.number(),
    removed: z.number(),
    whitespaceOnlyHidden: z.boolean(),
    rows: z
      .array(
        z.object({ cells: z.array(diffCellSchema).readonly(), fullWidth: z.boolean() }).readonly(),
      )
      .readonly(),
  })
  .readonly();
export type DiffView = z.infer<typeof diffViewSchema>;
export const reviewOpenRpc = defineRpc({
  name: "review.open",
  input: z.object({ workspaceId: z.string().min(1), ...repositoryInput }),
  output: z
    .object({ snapshot: reviewSnapshotSchema, files: z.array(reviewFileSchema).readonly() })
    .readonly(),
});
export const reviewFileRpc = defineRpc({
  name: "review.file",
  input: z.object({
    workspaceId: z.string().min(1),
    ...repositoryInput,
    snapshot: reviewSnapshotSchema,
    path: z.string().min(1),
  }),
  output: z.object({ view: diffViewSchema, notice: z.string().nullable() }).readonly(),
});
