import { realpath } from "node:fs/promises";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import {
  reviewFileRpc,
  reviewFileSchema,
  reviewOpenRpc,
  reviewSnapshotSchema,
  reviewTargetSchema,
  reviewedChangeSchema,
  reviewTargetLabel,
  branchReview,
  type ReviewTarget,
  type ReviewSnapshot,
} from "../shared/review.js";
import { jsonLines, runJj } from "./jj.js";
import { resolveRepository } from "./repository.js";
import { patchToView } from "./review-patch.js";
import { highlightReview } from "./review-highlight.js";
import { linearRange } from "../shared/linear-range.js";

const fileTemplate =
  'json({"path" => self.path(), "oldPath" => self.source().path(), "status" => self.status_char()}) ++ "\\n"';
const filesSchema = z.array(reviewFileSchema).readonly();
const nodeSchema = reviewedChangeSchema
  .unwrap()
  .extend({ parents: z.array(z.string()).readonly() })
  .readonly();
const revisionTemplate =
  'json({"commitId" => commit_id, "changeId" => change_id, "parents" => parents.map(|p| p.commit_id()), "description" => description, "author" => author.name(), "timestamp" => author.timestamp().format("%Y-%m-%dT%H:%M:%S%:z"), "hasConflict" => conflict}) ++ "\\n"';

function diffArguments(snapshot: ReviewSnapshot): string[] {
  const comparison = snapshot.comparison;
  return comparison.kind === "endpoints"
    ? ["--from", comparison.from, "--to", comparison.to]
    : ["-r", comparison.revisions.join(" | ")];
}

async function changedFiles(root: string, snapshot: ReviewSnapshot, signal?: AbortSignal) {
  return filesSchema.parse(
    jsonLines(
      await runJj(root, ["diff", ...diffArguments(snapshot), "-T", fileTemplate], {
        operation: snapshot.operation,
        signal,
      }),
    ),
  );
}

export async function openReview(
  root: string,
  input: ReviewTarget = branchReview,
  signal?: AbortSignal,
) {
  const target = reviewTargetSchema.parse(input);
  root = await realpath(root);
  await runJj(root, ["util", "snapshot"], { readOnly: false, signal });
  const operation = (
    await runJj(root, ["op", "log", "--no-graph", "-n", "1", "-T", "id"], { signal })
  ).trim();
  const read = async (revset: string) => {
    const output = await runJj(
      root,
      ["log", "--no-graph", "-r", revset, "-n", "1001", "-T", revisionTemplate],
      { operation, signal },
    );
    return z.array(nodeSchema).readonly().parse(jsonLines(output));
  };
  const resolve = async (revset: string) => {
    const nodes = await read(revset);
    if (nodes.length !== 1) throw new Error(`${revset} must resolve to exactly one revision.`);
    return nodes[0].commitId;
  };
  let comparison: ReviewSnapshot["comparison"];
  let label = reviewTargetLabel(target);
  let change: z.infer<typeof reviewedChangeSchema> | null = null;
  if (target.kind === "branch" || target.kind === "endpoints") {
    const from = await resolve(target.kind === "branch" ? "fork_point(main|@)" : target.from);
    const to = await resolve(target.kind === "branch" ? "@" : target.to);
    comparison = { kind: "endpoints", from, to };
  } else {
    let nodes: ReadonlyArray<z.infer<typeof nodeSchema>>;
    if (target.kind === "revisions" || target.kind === "change") {
      nodes = await read(target.kind === "change" ? target.revision : target.revset);
      if (target.kind === "change" && nodes.length !== 1)
        throw new Error("Enter exactly one change, or use Changes (revset) for multiple changes.");
    } else {
      const targets = target.end ? [target.anchor, target.end] : [target.anchor];
      const candidates = await read(
        `all() & (${targets.map((revision) => `change_id("${revision.changeId}")`).join(" | ")})`,
      );
      const resolved = targets.map((revision) => {
        const matches = candidates.filter((node) => node.changeId === revision.changeId);
        const exact = matches.find((node) => node.commitId === revision.commitId);
        if (exact) return exact;
        if (matches.length === 1) return matches[0];
        throw new Error(
          "A selected change is missing or divergent. Refresh history and select it again.",
        );
      });
      if (resolved.length === 1) nodes = resolved;
      else {
        const [anchor, end] = resolved;
        const interval = await read(
          `${anchor.commitId}::${end.commitId} | ${end.commitId}::${anchor.commitId}`,
        );
        const path = linearRange(interval, anchor.commitId, end.commitId);
        if (!path)
          throw new Error(
            "Select changes on the same linear stack. Ranges cannot cross branches or merges.",
          );
        nodes = path;
      }
    }
    if (nodes.length === 0) throw new Error("The selected revset is empty.");
    if (nodes.length > 1000) throw new Error("Review at most 1,000 changes at a time.");
    comparison = { kind: "revisions", revisions: nodes.map((node) => node.commitId) };
    if (nodes.length === 1) change = reviewedChangeSchema.parse(nodes[0]);
    label =
      nodes.length === 1
        ? `${nodes[0].changeId.slice(0, 12)} · ${nodes[0].description.split("\n")[0] || "(no description)"}`
        : target.kind === "selection"
          ? `${nodes.length} changes · ${nodes.at(-1)!.changeId.slice(0, 12)} → ${nodes[0].changeId.slice(0, 12)} (inclusive)`
          : `${nodes.length} changes · ${reviewTargetLabel(target)}`;
  }
  const snapshot = reviewSnapshotSchema.parse({
    root,
    operation,
    comparison,
    label,
    change,
  });
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
  const file = files.find((file) => file.path === input.path);
  if (!file) throw new Error("This file is not in the pinned review.");
  const patch = await runJj(
    root,
    [
      "diff",
      ...diffArguments(snapshot),
      "--git",
      "--context=2147483647",
      "--",
      `file:${JSON.stringify(input.path)}`,
    ],
    { operation: snapshot.operation, signal },
  );
  const view = await highlightReview(patchToView(patch), file, signal);
  return {
    view,
    notice: /^(?:Binary files |Binary file )/m.test(patch)
      ? "Binary file contents are not displayed in this prototype."
      : view.rows.length === 0
        ? "No textual changes. This file may only have a path or permission change."
        : null,
  };
}

async function repository(
  input: Pick<RpcInput<typeof reviewOpenRpc>, "workspaceId" | "repository">,
  { paseo }: PluginHandlerContext,
) {
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
      return run(async () =>
        openReview(await repository(input, context), input.target, lifetime.signal),
      );
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
