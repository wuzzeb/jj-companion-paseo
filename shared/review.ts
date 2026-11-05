import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { repositoryInput } from "./repositories.js";

export const reviewBranchRpc = defineRpc({
  name: "review.branch",
  input: z.object({ workspaceId: z.string().min(1), ...repositoryInput }),
  output: z.object({ launched: z.boolean() }).readonly(),
});
