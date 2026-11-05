import { z } from "zod";
import { revisionSchema } from "../shared/bookmarks.js";
import { linearRange } from "../shared/linear-range.js";
import {
  mergeReviewMessage,
  reviewSelectionSchema,
  type ReviewSelection,
} from "../shared/review.js";
import { jsonLines, runJj } from "./jj.js";

const nodeSchema = revisionSchema.extend({ parents: z.array(z.string()).readonly() }).readonly();
const nodesSchema = z.array(nodeSchema).readonly();
const template =
  'json({"commitId" => commit_id, "changeId" => change_id, "parents" => parents.map(|p| p.commit_id())}) ++ "\\n"';

export async function resolveReviewComparison(
  root: string,
  input: ReviewSelection,
  signal?: AbortSignal,
) {
  const selection = reviewSelectionSchema.parse(input);
  // Like other explicit workspace actions, include edits on disk before pinning the comparison.
  await runJj(root, ["util", "snapshot"], { readOnly: false, signal });
  const operation = (
    await runJj(root, ["op", "log", "--no-graph", "-n", "1", "-T", "id"], { signal })
  ).trim();
  const read = async (revset: string) =>
    nodesSchema.parse(
      jsonLines(
        await runJj(root, ["log", "--no-graph", "-r", revset, "-T", template], {
          operation,
          signal,
        }),
      ),
    );
  const targets =
    selection.kind === "change" ? [selection.revision] : [selection.anchor, selection.end];
  const candidates = await read(
    `all() & (${targets.map((target) => `change_id("${target.changeId}")`).join(" | ")})`,
  );
  const resolved = targets.map((target) => {
    const matches = candidates.filter((candidate) => candidate.changeId === target.changeId);
    const exact = matches.find((candidate) => candidate.commitId === target.commitId);
    if (exact) return exact;
    if (matches.length === 1) return matches[0];
    throw new Error(
      "A selected change is missing or divergent. Refresh history and select it again.",
    );
  });
  const anchor = resolved[0];
  const interval =
    selection.kind === "change"
      ? [anchor]
      : await read(
          `${anchor.commitId}::${resolved[1].commitId} | ${resolved[1].commitId}::${anchor.commitId}`,
        );
  const path = linearRange(interval, anchor.commitId, resolved.at(-1)!.commitId);
  if (!path)
    throw new Error(
      "Choose changes on the same linear stack. Review ranges cannot cross branches or merges.",
    );
  const newest = path[0];
  const oldest = path.at(-1)!;
  if (oldest.parents.length > 1) throw new Error(mergeReviewMessage);
  // The synthetic jj root is empty; comparing it with itself is a valid empty review.
  const before = oldest.parents[0] ?? oldest.commitId;
  return `${before}..${newest.commitId}`;
}
