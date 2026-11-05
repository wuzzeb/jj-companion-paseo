import { realpath } from "node:fs/promises";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import {
  reviewFileRpc,
  reviewFileSchema,
  reviewOpenRpc,
  reviewSnapshotSchema,
  type ReviewSnapshot,
} from "../shared/review.js";
import { jsonLines, runJj } from "./jj.js";
import { resolveRepository } from "./repository.js";
import { patchToView } from "./review-patch.js";

const fileTemplate =
  'json({"path" => self.path(), "oldPath" => self.source().path(), "status" => self.status_char()}) ++ "\\n"';
const filesSchema = z.array(reviewFileSchema).readonly();

async function changedFiles(root: string, snapshot: ReviewSnapshot, signal?: AbortSignal) {
  return filesSchema.parse(
    jsonLines(
      await runJj(
        root,
        ["diff", "--from", snapshot.from, "--to", snapshot.to, "-T", fileTemplate],
        { operation: snapshot.operation, signal },
      ),
    ),
  );
}

export async function openReview(root: string, signal?: AbortSignal) {
  root = await realpath(root);
  await runJj(root, ["util", "snapshot"], { readOnly: false, signal });
  const operation = (
    await runJj(root, ["op", "log", "--no-graph", "-n", "1", "-T", "id"], { signal })
  ).trim();
  const resolve = async (revset: string) => {
    const output = await runJj(
      root,
      ["log", "--no-graph", "-r", revset, "-T", 'commit_id ++ "\\n"'],
      { operation, signal },
    );
    const ids = output.trim().split("\n").filter(Boolean);
    if (ids.length !== 1) throw new Error(`${revset} must resolve to exactly one revision.`);
    return ids[0];
  };
  const from = await resolve("fork_point(main|@)");
  const to = await resolve("@");
  const snapshot = reviewSnapshotSchema.parse({ root, operation, from, to });
  return { snapshot, files: await changedFiles(root, snapshot, signal) };
}

export async function readReviewFile(
  root: string,
  input: Pick<RpcInput<typeof reviewFileRpc>, "snapshot" | "path">,
  signal?: AbortSignal,
) {
  const snapshot = reviewSnapshotSchema.parse(input.snapshot);
  if ((await realpath(root)) !== snapshot.root)
    throw new Error("The repository changed. Refresh the review.");
  const files = await changedFiles(root, snapshot, signal);
  if (!files.some((file) => file.path === input.path))
    throw new Error("This file is not in the pinned review.");
  const patch = await runJj(
    root,
    [
      "diff",
      "--from",
      snapshot.from,
      "--to",
      snapshot.to,
      "--git",
      "--context=2147483647",
      "--",
      `file:${JSON.stringify(input.path)}`,
    ],
    { operation: snapshot.operation, signal },
  );
  const view = patchToView(patch);
  return {
    view,
    notice: /^(?:Binary files |Binary file )/m.test(patch)
      ? "Binary file contents are not displayed in this prototype."
      : view.rows.length === 0
        ? "No textual changes. This file may only have a path or permission change."
        : null,
  };
}

async function repository(input: RpcInput<typeof reviewOpenRpc>, { paseo }: PluginHandlerContext) {
  const workspace = await paseo.workspaces.ref(input.workspaceId).refresh();
  if (!workspace || workspace.archivingAt) throw new Error("Workspace is unavailable.");
  const root = await resolveRepository(workspace.workspaceDirectory, input.repository);
  if (!root) throw new Error("This workspace is not in a jj repository.");
  return root;
}

export function createReviews() {
  const lifetime = new AbortController();
  const pending = new Set<Promise<unknown>>();
  function run<T>(operation: () => Promise<T>) {
    const task = operation().finally(() => pending.delete(task));
    pending.add(task);
    return task;
  }
  return {
    open(input: RpcInput<typeof reviewOpenRpc>, context: PluginHandlerContext) {
      return run(async () => openReview(await repository(input, context), lifetime.signal));
    },
    file(input: RpcInput<typeof reviewFileRpc>, context: PluginHandlerContext) {
      return run(async () =>
        readReviewFile(await repository(input, context), input, lifetime.signal),
      );
    },
    async dispose() {
      lifetime.abort();
      await Promise.allSettled(pending);
    },
  };
}
