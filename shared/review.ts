import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { repositoryInput } from "./repositories.js";
import { revisionSchema } from "./bookmarks.js";

const reviewResult = z.object({ launched: z.boolean(), warning: z.string().optional() }).readonly();
export const reviewSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("change"), revision: revisionSchema.readonly() }).readonly(),
  z
    .object({
      kind: z.literal("range"),
      anchor: revisionSchema.readonly(),
      end: revisionSchema.readonly(),
    })
    .readonly(),
]);
export type ReviewSelection = z.infer<typeof reviewSelectionSchema>;
export const mergeReviewMessage =
  "Selections starting at a merge are not supported yet. Select changes after the merge, or use Review branch.";

export const reviewBranchRpc = defineRpc({
  name: "review.branch",
  input: z.object({ workspaceId: z.string().min(1), ...repositoryInput }),
  output: reviewResult,
});

export const reviewSelectionRpc = defineRpc({
  name: "review.selection",
  input: z.object({
    workspaceId: z.string().min(1),
    ...repositoryInput,
    selection: reviewSelectionSchema,
  }),
  output: reviewResult,
});
