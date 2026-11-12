import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { repositoryInput } from "./repositories.js";
import { revisionSchema } from "./bookmarks.js";

const commitId = z.string().regex(/^[0-9a-f]{40,64}$/);
const expression = z.string().trim().min(1).max(4096);
export const reviewTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("branch") }).readonly(),
  z.object({ kind: z.literal("endpoints"), from: expression, to: expression }).readonly(),
  z.object({ kind: z.literal("revisions"), revset: expression }).readonly(),
  z.object({ kind: z.literal("change"), revision: expression }).readonly(),
  z
    .object({
      kind: z.literal("selection"),
      anchor: revisionSchema.readonly(),
      end: revisionSchema.readonly().optional(),
    })
    .readonly(),
]);
export type ReviewTarget = z.infer<typeof reviewTargetSchema>;
export const branchReview = { kind: "branch" } as const;
export const branchBaseRevset = "fork_point(trunk()|@)";
export function reviewTargetLabel(target: ReviewTarget): string {
  switch (target.kind) {
    case "branch":
      return `${branchBaseRevset} → @`;
    case "endpoints":
      return `${target.from} → ${target.to}`;
    case "revisions":
      return `Changes in ${target.revset}`;
    case "change":
      return `Change ${target.revision}`;
    case "selection":
      return target.end
        ? `Changes ${target.anchor.changeId.slice(0, 12)} ↔ ${target.end.changeId.slice(0, 12)} (inclusive)`
        : `Change ${target.anchor.changeId.slice(0, 12)}`;
  }
}
export const reviewedChangeSchema = revisionSchema
  .extend({
    description: z.string(),
    author: z.string(),
    timestamp: z.string(),
    hasConflict: z.boolean(),
  })
  .readonly();
const comparisonSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("endpoints"), from: commitId, to: commitId }).readonly(),
  z
    .object({
      kind: z.literal("revisions"),
      revisions: z.array(commitId).min(1).max(1000).readonly(),
    })
    .readonly(),
]);
export const reviewSnapshotSchema = z
  .object({
    root: z.string().min(1),
    operation: z.string().regex(/^[0-9a-f]{128}$/),
    comparison: comparisonSchema,
    label: z.string(),
    change: reviewedChangeSchema.nullable().default(null),
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
  input: z.object({
    workspaceId: z.string().min(1),
    ...repositoryInput,
    target: reviewTargetSchema.default(branchReview),
  }),
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
