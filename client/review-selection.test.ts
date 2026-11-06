import assert from "node:assert/strict";
import { test } from "node:test";
import { linearRange } from "../shared/linear-range.js";

test("range selection follows ancestry in either direction and skips neighboring branches", () => {
  const changes = [
    { commitId: "new", parents: ["mid"] },
    { commitId: "other", parents: ["base"] },
    { commitId: "mid", parents: ["old"] },
    { commitId: "old", parents: ["base"] },
  ];
  for (const [anchor, end] of [
    ["old", "new"],
    ["new", "old"],
  ])
    assert.deepEqual(
      linearRange(changes, anchor, end)?.map((change) => change.commitId),
      ["new", "mid", "old"],
    );
  assert.equal(linearRange(changes, "new", "other"), null);
});
