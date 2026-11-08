import assert from "node:assert/strict";
import { test } from "node:test";
import { HIGHLIGHT_MAX_SOURCE_BYTES } from "@getpaseo/highlight";
import { patchToView } from "./review-patch.js";
import { highlightReview } from "./review-highlight.js";
import type { DiffView } from "../shared/review.js";

const file = { oldPath: "before.ts", path: "after.ts" };
const content = (view: DiffView) =>
  view.rows.map((row) =>
    row.cells.map((cell) => ({ ...cell, spans: cell.spans.map((span) => span.text).join("") })),
  );

test("highlights each complete document separately and preserves split alignment and EOF", async () => {
  const plain = patchToView(`@@ -1,3 +1,4 @@
-const old = "café 🦉";
+const next = 42;
+/* comment starts
 unchanged
-last
+*/
\\ No newline at end of file
`);
  const view = await highlightReview(plain, file);
  assert.deepEqual(content(view), content(plain));
  assert.equal(view.added, plain.added);
  assert.equal(view.removed, plain.removed);
  assert.ok(view.rows[0].cells[0].spans.some((span) => span.token === "paseo-string"));
  assert.ok(view.rows[0].cells[1].spans.some((span) => span.token === "paseo-number"));
  // The same context line has different syntax state in each document.
  const context = view.rows.find((row) => row.cells[0].style === "context")!;
  assert.ok(context.cells[1].spans.some((span) => span.token === "paseo-comment"));
  assert.ok(context.cells[0].spans.every((span) => span.token !== "paseo-comment"));
});

test("uses each rename path to choose its language", async () => {
  const plain = patchToView("@@ -1 +1 @@\n-const value = 1;\n+const value = 2;\n");
  const view = await highlightReview(plain, { oldPath: "notes.txt", path: "code.ts" });
  assert.deepEqual(view.rows[0].cells[0], plain.rows[0].cells[0]);
  assert.ok(view.rows[0].cells[1].spans.some((span) => span.token === "paseo-keyword"));
});

test("highlights additions and deletions without coloring alignment placeholders", async () => {
  for (const prefix of ["+", "-"]) {
    const plain = patchToView(
      prefix === "+"
        ? "@@ -0,0 +1 @@\n+const value = true;\n"
        : "@@ -1 +0,0 @@\n-const value = true;\n",
    );
    const view = await highlightReview(plain, file);
    assert.deepEqual(content(view), content(plain));
    const side = prefix === "+" ? 1 : 0;
    assert.ok(view.rows[0].cells[side].spans.some((span) => span.token === "paseo-keyword"));
    assert.deepEqual(view.rows[0].cells[1 - side], plain.rows[0].cells[1 - side]);
  }
});

test("unsupported, oversized, and cancelled highlighting falls back to plain text", async () => {
  const plain = patchToView("@@ -1 +1 @@\n-hello\n+world\n");
  assert.equal(await highlightReview(plain, { oldPath: "a.unknown", path: "b.unknown" }), plain);
  const controller = new AbortController();
  controller.abort();
  assert.equal(await highlightReview(plain, file, controller.signal), plain);
  const large = patchToView(`@@ -0,0 +1 @@\n+${"x".repeat(HIGHLIGHT_MAX_SOURCE_BYTES + 1)}\n`);
  assert.equal(await highlightReview(large, file), large);
});
