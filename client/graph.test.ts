import assert from "node:assert/strict";
import { test } from "node:test";
import type { Change } from "../shared/history.js";
import { layoutGraph, nodeY, resolveSelection, rowHeight } from "./graph.js";

function change(commitId: string, parents: string[] = []): Change {
  return {
    commitId,
    parents,
    changeId: commitId,
    description: commitId,
    author: "Test",
    timestamp: "2026-10-21T12:00:00Z",
    bookmarks: [],
    workspaces: [],
    isWorkingCopy: false,
    isImmutable: false,
    isEmpty: false,
    hasConflict: false,
  };
}

test("a linear stack joins at row boundaries and stops at the root", () => {
  const { rows } = layoutGraph([change("c", ["b"]), change("b", ["a"]), change("a")]);
  assert.deepEqual(
    rows.map((row) => row.lane),
    [0, 0, 0],
  );
  assert.deepEqual(rows[0].lines, [{ fromLane: 0, toLane: 0, fromY: nodeY, toY: rowHeight }]);
  assert.deepEqual(rows[2].lines, [{ fromLane: 0, toLane: 0, fromY: 0, toY: nodeY }]);
});

test("forks keep distinct lanes until they join their shared parent", () => {
  const { rows } = layoutGraph([
    change("left", ["base"]),
    change("right", ["base"]),
    change("base"),
  ]);
  assert.deepEqual(
    rows.map((row) => row.lane),
    [0, 1, 0],
  );
  assert.ok(rows[1].lines.some((line) => line.fromLane === 0 && line.toLane === 0));
  assert.ok(rows[1].lines.some((line) => line.fromLane === 1 && line.toLane === 0));
  assert.equal(rows[2].lines.length, 1);
});

test("a merge branches into both parents and reuses lanes after they converge", () => {
  const { rows } = layoutGraph([
    change("merge", ["left", "right"]),
    change("left", ["base"]),
    change("right", ["base"]),
    change("base"),
    change("unrelated"),
  ]);
  assert.deepEqual(
    rows.map((row) => row.lane),
    [0, 0, 1, 0, 0],
  );
  assert.deepEqual(
    rows[0].lines.map((line) => line.toLane),
    [0, 1],
  );
  assert.deepEqual(rows[4].lines, []);
});

test("truncated ancestry ends in a stub rather than connecting unrelated rows", () => {
  const { rows } = layoutGraph([change("a", ["off-page"]), change("b")]);
  assert.equal(rows[0].lines[0].missing, true);
  assert.ok(rows[0].lines[0].toY < rowHeight);
  assert.deepEqual(rows[1].lines, []);
});

test("selection follows a rewrite only when its change ID is unambiguous", () => {
  const original = change("old");
  const rewritten = { ...original, commitId: "new" };
  assert.equal(resolveSelection([rewritten], original), rewritten);
  assert.equal(
    resolveSelection([rewritten, { ...rewritten, commitId: "divergent" }], original),
    null,
  );
  assert.equal(resolveSelection([change("other")], original), null);
  const workingCopy = { ...change("working"), isWorkingCopy: true };
  assert.equal(resolveSelection([original, workingCopy], null), workingCopy);
  assert.equal(resolveSelection([original, rewritten], original), original);
});
