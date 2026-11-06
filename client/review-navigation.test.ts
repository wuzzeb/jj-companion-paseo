import assert from "node:assert/strict";
import { test } from "node:test";
import { createReviewNavigation } from "./review-navigation.js";
import { linearRange } from "../shared/linear-range.js";

test("review handoff retains requests before mounting and isolates hosts and workspaces", () => {
  const opened: string[] = [];
  const navigation = createReviewNavigation((workspace) => opened.push(workspace));
  const target = { kind: "revisions" as const, revset: "@-" };
  navigation.open("host-a", "workspace", "child", target);
  const first = navigation.get("host-a", "workspace");
  assert.equal(first?.repository, "child");
  assert.deepEqual(first?.target, target);
  assert.equal(navigation.get("host-b", "workspace"), null);
  assert.equal(navigation.get("host-a", "another"), null);
  let notifications = 0;
  const unsubscribe = navigation.subscribe(() => notifications++);
  navigation.open("host-a", "workspace", "child", target);
  assert.equal(notifications, 1);
  assert.notEqual(
    navigation.get("host-a", "workspace")?.id,
    first?.id,
    "opening the same selection again must refresh it",
  );
  assert.deepEqual(opened, ["workspace", "workspace"]);
  unsubscribe();
  navigation.dispose();
  assert.equal(navigation.get("host-a", "workspace"), null);
});

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
