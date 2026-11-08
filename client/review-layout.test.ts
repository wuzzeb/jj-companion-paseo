import assert from "node:assert/strict";
import { test } from "node:test";
import { patchToView } from "../server/review-patch.js";
import { highlightReview } from "../server/review-highlight.js";
import { collapseContext } from "./review-context.js";
import { inlineDiff } from "./review-layout.js";

test("inline replacements group removed lines before additions with both line number columns", () => {
  const split = patchToView(`@@ -1,4 +1,5 @@
 context
-old one
-old two
+new one
+new two
+new three
 end
`);
  const inline = inlineDiff(split);
  assert.deepEqual(
    inline.rows.map(({ cells }) => {
      assert.equal(cells.length, 1);
      const cell = cells[0];
      return [cell.oldLine, cell.newLine, cell.spans.map((span) => span.text).join("")];
    }),
    [
      [1, 1, "context"],
      [2, null, "old one"],
      [3, null, "old two"],
      [null, 2, "new one"],
      [null, 3, "new two"],
      [null, 4, "new three"],
      [4, 5, "end"],
    ],
  );
  assert.equal(inline.added, 3);
  assert.equal(inline.removed, 2);
});

test("inline layout keeps syntax spans, EOF markers and collapsed context", async () => {
  const split = await highlightReview(
    patchToView(`@@ -1,2 +1,2 @@
 const context = 0;
-const value = 1;
+const value = 2;
\\ No newline at end of file
`),
    { oldPath: "test.ts", path: "test.ts" },
  );
  const collapsed = collapseContext(split, 0);
  const inline = inlineDiff(collapsed);
  assert.equal(inline.rows[0], collapsed.rows[0]);
  assert.equal(inline.rows[0].cells[0].style, "separator");
  assert.equal(inline.rows[1].cells[0].spans, split.rows[1].cells[0].spans);
  assert.equal(inline.rows[2].cells[0].spans, split.rows[1].cells[1].spans);
  assert.equal(inline.rows[2].cells[0].noEofNewline, true);
  assert.equal(inline.rows[2].cells[0].newLine, 2);
});

test("inline layout omits placeholders in added and deleted files", () => {
  for (const patch of ["@@ -0,0 +1 @@\n+new\n", "@@ -1 +0,0 @@\n-old\n"]) {
    const inline = inlineDiff(patchToView(patch));
    assert.equal(inline.rows.length, 1);
    assert.equal(inline.rows[0].cells.length, 1);
    assert.match(inline.rows[0].cells[0].style, /^(added|removed)$/);
  }
});
