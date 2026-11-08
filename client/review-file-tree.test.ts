import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFileTree, type FileNode } from "./review-file-tree.js";
import type { ReviewFile } from "../shared/review.js";

const file = (path: string, status = "M", oldPath = path): ReviewFile => ({
  path,
  status,
  oldPath,
});
const paths = (nodes: ReadonlyArray<FileNode>): ReadonlyArray<string> =>
  nodes.flatMap((node) => (node.kind === "directory" ? paths(node.children) : [node.file.path]));

test("tree groups nested paths, sorts directories first, and preserves every file", () => {
  const files = [
    file("z.ts"),
    file("src/z.ts"),
    file("src/lib/a.ts"),
    file("docs/readme.md"),
    file("src/a.ts"),
    file("a.ts"),
  ];
  const original = [...files];
  const tree = buildFileTree(files);
  assert.deepEqual(
    tree.map((node) => [node.kind, node.name, node.path]),
    [
      ["directory", "docs", "docs"],
      ["directory", "src", "src"],
      ["file", "a.ts", "a.ts"],
      ["file", "z.ts", "z.ts"],
    ],
  );
  assert.deepEqual(paths(tree), [
    "docs/readme.md",
    "src/lib/a.ts",
    "src/a.ts",
    "src/z.ts",
    "a.ts",
    "z.ts",
  ]);
  assert.deepEqual(files, original);
});

test("tree preserves renamed and deleted entries, duplicate basenames, and literal paths", () => {
  const files = [
    file("src/new name.ts", "R", "old.ts"),
    file("deleted.ts", "D"),
    file("a/same.ts"),
    file("b/same.ts"),
    file("src/🦉.ts"),
  ];
  const leaves = (nodes: ReadonlyArray<FileNode>): ReadonlyArray<ReviewFile> =>
    nodes.flatMap((node) => (node.kind === "directory" ? leaves(node.children) : [node.file]));
  const result = leaves(buildFileTree(files));
  assert.equal(result.length, files.length);
  for (const entry of files) assert.ok(result.includes(entry));
});

test("a replaced file and a directory with the same path stay distinct", () => {
  const tree = buildFileTree([file("src", "D"), file("src/new.ts", "A")]);
  assert.deepEqual(
    tree.map((node) => [node.kind, node.path]),
    [
      ["directory", "src"],
      ["file", "src"],
    ],
  );
  assert.deepEqual(paths(tree), ["src/new.ts", "src"]);
  assert.deepEqual(buildFileTree([]), []);
});
