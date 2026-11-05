import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const checkout = resolve(process.argv[2] ?? "jayjay");
const revision = execFileSync(
  "jj",
  ["--ignore-working-copy", "-R", checkout, "log", "-r", "@", "--no-graph", "-T", "commit_id"],
  { encoding: "utf8" },
).trim();
const destination = resolve("client/vendor/jayjay");
const write = async (name, content) => {
  const path = join(destination, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};
const read = async (name) =>
  execFileSync(
    "jj",
    [
      "--ignore-working-copy",
      "-R",
      checkout,
      "file",
      "show",
      "-r",
      revision,
      "--",
      `web/review/${name}`,
    ],
    { cwd: checkout, encoding: "utf8" },
  );
const adapt = (code) =>
  code
    .replace(/(from ["'])(\.[^"']+)(["'])/g, "$1$2.js$3")
    .replace(/^(\s+)(\w+\??): /gm, "$1readonly $2: ")
    .replace(/states: ReviewState\[\]/g, "states: ReadonlyArray<ReviewState>")
    .replace(/spans: DiffSpan\[\]/g, "spans: ReadonlyArray<DiffSpan>")
    .replace(/cells: DiffCell\[\]/g, "readonly cells: ReadonlyArray<DiffCell>")
    .replace(/rows: (\{[^\n]+\})\[\]/g, "rows: ReadonlyArray<$1>")
    .replace("Record<string, string>", "Readonly<Record<string, string>>")
    .replace("anchor: { side:", "anchor: { readonly side:")
    .replace("; line: number; group: number", "; readonly line: number; readonly group: number")
    .replace("; fullWidth: boolean", "; readonly fullWidth: boolean");
for (const name of [
  "components/diff/DiffPane.tsx",
  "model/diff.ts",
  "themes.ts",
  "generated/diffThemes.ts",
]) {
  await write(name, adapt(await read(`src/${name}`)));
}
const reviewState = (await read("src/model/review.ts")).match(
  /export type ReviewState = [^;]+;/,
)?.[0];
if (!reviewState) throw new Error("Upstream ReviewState declaration changed.");
await write("model/review.ts", reviewState + "\n");
await write(
  "styles.ts",
  `// Generated from JayJay web/review/src/styles/diff.css at ${revision}.\nexport const diffCss = ${JSON.stringify(await read("src/styles/diff.css"))};\n`,
);
await write("LICENSE", await read("LICENSE"));
await write(
  "NOTICE.md",
  `# JayJay DiffPane\n\nSource: https://github.com/hewigovens/jayjay/tree/${revision}/web/review\n\nCopyright JayJay contributors. Apache-2.0; see LICENSE.\n\nThis is the standalone DiffPane, its diff model, theme metadata, and diff stylesheet.\nNo app/shell code, fonts, worker, WASM, review storage, or React runtime is included.\n\nLocal adaptations: explicit .js import extensions, readonly property/array types,\nthe isolated ReviewState type, and CSS exported as a string for Paseo's single bundle.\nRendering behavior is upstream's. The host supplies aligned rows and theme variables.\n\nRegenerate from a source checkout with:\n\n\`\`\`sh\nnode tools/vendor-jayjay.mjs /path/to/jayjay\npnpm exec oxfmt client/vendor/jayjay\n\`\`\`\n`,
);
console.log(`Vendored JayJay DiffPane at ${revision}`);
