import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(join(root, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
const source = join(root, "jayjay/web/review/src");

// Match the asset-relevant compiler settings, not Paseo's complete boundary checks or runtime.
const cases = [
  [
    "DiffPane",
    `import { DiffPane } from ${JSON.stringify(join(source, "react.ts"))}; export default DiffPane;`,
  ],
  [
    "ReviewWorkspace",
    `export { ReviewWorkspace, useReview } from ${JSON.stringify(join(source, "react.ts"))};`,
  ],
  [
    "DiffPane and CSS",
    `export { DiffPane } from ${JSON.stringify(join(source, "react.ts"))}; import ${JSON.stringify(join(source, "styles.css"))};`,
  ],
  [
    "LocalReviewClient",
    `export { LocalReviewClient } from ${JSON.stringify(join(source, "local.ts"))};`,
  ],
];
for (const [name, contents] of cases) {
  try {
    const result = await esbuild.build({
      stdin: { contents, resolveDir: root, sourcefile: "probe.ts", loader: "ts" },
      bundle: true,
      format: "cjs",
      jsx: "automatic",
      platform: "neutral",
      target: "es2020",
      mainFields: ["module", "main"],
      external: ["react", "react/jsx-runtime"],
      treeShaking: true,
      minify: true,
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0].contents;
    console.log(
      JSON.stringify({
        name,
        success: true,
        javascriptBytes: code.length,
        gzipBytes: gzipSync(code).length,
        warnings: result.warnings.map((warning) => warning.text),
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        name,
        success: false,
        errors: error.errors?.map((entry) => entry.text) ?? [String(error)],
      }),
    );
  }
}

// An explicit prebuild can flatten the stylesheet before Paseo sees the generated JS.
const stylesheet = await esbuild.build({
  entryPoints: [join(source, "styles.css")],
  bundle: true,
  write: false,
  outfile: join(tmpdir(), "jj-review-prebuild.css"),
  loader: { ".woff2": "dataurl" },
  minify: true,
  logLevel: "silent",
});
const css = stylesheet.outputFiles[0].text;
const inlineStyles = await esbuild.transform(`export const css=${JSON.stringify(css)};`, {
  format: "cjs",
  minify: true,
  target: "es2020",
});
assert.ok(!css.includes("@import"));
assert.ok(css.includes("data:font/woff2") || css.includes("data:application/font-woff2"));
console.log(
  JSON.stringify({
    name: "prebuilt inline JayJay CSS",
    cssBytes: Buffer.byteLength(css),
    generatedJavascriptBytes: Buffer.byteLength(inlineStyles.code),
    gzipBytes: gzipSync(inlineStyles.code).length,
    unresolvedImports: false,
    fontEmbedded: true,
  }),
);

const temporary = mkdtempSync(join(tmpdir(), "jj-diff-research-"));
try {
  const repo = join(temporary, "repo");
  mkdirSync(repo);
  const config = join(temporary, "config.toml");
  writeFileSync(config, '[user]\nname="Diff Research"\nemail="research@example.invalid"\n');
  const jj = (...args) =>
    execFileSync("jj", ["--no-pager", "--color=never", ...args], {
      cwd: repo,
      env: { ...process.env, JJ_CONFIG: config },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  jj("git", "init", "--no-colocate");
  const initial = Array.from({ length: 120 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
  const file = join(repo, "sample.txt");
  writeFileSync(file, initial);
  jj("describe", "-m", "base");
  const id = () => jj("--ignore-working-copy", "log", "--no-graph", "-r", "@", "-T", "commit_id");
  const base = id();
  jj("new", base, "-m", "left");
  writeFileSync(file, initial.replace("line 20\n", "left edit\n"));
  jj("status");
  const left = id();
  jj("new", base, "-m", "right");
  writeFileSync(file, initial.replace("line 100\n", "right edit\n"));
  jj("status");
  const right = id();
  jj("new", left, right, "-m", "merge");
  writeFileSync(file, readFileSync(file, "utf8").replace("line 60\n", "merge-only edit\n"));
  jj("status");
  const operation = () =>
    jj("--ignore-working-copy", "op", "log", "--no-graph", "-n", "1", "-T", "id");
  const beforeOperation = operation();
  const readOnly = ["--ignore-working-copy", `--at-operation=${beforeOperation}`];
  const metadata = JSON.parse(
    jj(
      ...readOnly,
      "diff",
      "-r",
      "@",
      "-T",
      'json({"path" => path, "oldPath" => source.path(), "status" => status}) ++ "\\n"',
    ),
  );
  const capture = join(temporary, "capture.cjs");
  writeFileSync(
    capture,
    `const fs=require('node:fs');const path=require('node:path');console.log(JSON.stringify({before:fs.readFileSync(path.join(process.argv[2],'sample.txt'),'utf8'),after:fs.readFileSync(path.join(process.argv[3],'sample.txt'),'utf8')}));`,
  );
  const data = JSON.parse(
    jj(
      ...readOnly,
      `--config=merge-tools.capture.program=${JSON.stringify(process.execPath)}`,
      `--config=merge-tools.capture.diff-args=${JSON.stringify([capture, "$left", "$right"])}`,
      "diff",
      "-r",
      "@",
      "--tool",
      "capture",
    ),
  );
  assert.ok(data.before.includes("left edit\n"));
  assert.ok(data.before.includes("right edit\n"));
  assert.ok(!data.before.includes("merge-only edit\n"));
  assert.ok(data.after.includes("merge-only edit\n"));
  assert.equal(operation(), beforeOperation);
  console.log(
    JSON.stringify({
      name: "jj merged-parent export",
      version: jj("--version"),
      metadata,
      mergedParentBaseline: true,
      fullFileLines: data.before.split("\n").length - 1,
      operationUnchanged: true,
    }),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
