import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// A repository is either the workspace root or one immediate child directory.
export const repositorySelectionSchema = z
  .string()
  .refine(
    (value) => value === "." || (value.length > 0 && value !== ".." && !/[\\/\0]/.test(value)),
    "Invalid repository selection",
  );
export const repositoryInput = { repository: repositorySelectionSchema.optional() };
export const repositorySchema = z.object({ id: z.string(), label: z.string() }).readonly();
export type Repository = z.infer<typeof repositorySchema>;

export const repositoriesRpc = defineRpc({
  name: "repositories.list",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: z.array(repositorySchema).readonly(),
});
