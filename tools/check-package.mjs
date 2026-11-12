import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const metadataPath = resolve(process.argv[2] ?? "pack.json");
const result = JSON.parse(await readFile(metadataPath, "utf8"));
const [pkg] = Array.isArray(result) ? result : Object.values(result);
assert(pkg, "npm pack did not report a package");
const tarball = join(dirname(metadataPath), pkg.filename);
const files = new Set(pkg.files.map((file) => file.path));
for (const file of [
  "package.json",
  "paseo-plugin.json",
  "OVERVIEW.md",
  "README.md",
  "LICENSE",
  "index.server.ts",
  "index.client.tsx",
  "install-lock.yaml",
  "pnpm-workspace.yaml",
  "client/vendor/jayjay/LICENSE",
  "client/vendor/jayjay/NOTICE.md",
]) {
  assert(files.has(file), `Missing package file: ${file}`);
}
assert(
  ![...files].some(
    (file) =>
      /(?:^|\/)(?:node_modules|\.github|\.codex|tools)\//.test(file) || file.endsWith(".test.ts"),
  ),
  "Package contains development-only files",
);

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    // npm/pnpm can be .cmd launchers on Windows. Manifest commands and arguments
    // are maintained in this repository; other executables run without a shell.
    shell: process.platform === "win32" && ["npm", "pnpm"].includes(command),
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Command failed: ${command} ${args.join(" ")}`);
}

const temporary = await mkdtemp(join(tmpdir(), "jj-companion-package-"));
try {
  run("tar", ["-xzf", tarball, "-C", temporary]);
  const directory = join(temporary, "package");
  const manifest = JSON.parse(await readFile(join(directory, "paseo-plugin.json"), "utf8"));
  for (const file of [manifest.icon, ...(manifest.media ?? [])].filter(Boolean)) {
    if (!file.startsWith("https://")) assert(files.has(file), `Missing plugin asset: ${file}`);
  }
  const environment = { ...process.env, NODE_ENV: "production" };
  for (const [command, ...args] of manifest.build ?? []) {
    run(command, args, directory, environment);
  }
  for (const config of ["tsconfig.json", "tsconfig.client.json"]) {
    run(
      process.execPath,
      ["node_modules/typescript/bin/tsc", "--project", config, "--noEmit"],
      directory,
    );
  }
  console.log("Packed artifact installs and typechecks with NODE_ENV=production.");

  // Paseo owns compilation and currently exposes no public compiler entrypoint.
  // Accept the installed host module explicitly instead of depending on a copy.
  if (process.env.PASEO_COMPILER_MODULE) {
    assert(process.env.PASEO_VERSION, "Set PASEO_VERSION to the installed host's version");
    const { compileDirectoryPlugin } = await import(
      pathToFileURL(resolve(process.env.PASEO_COMPILER_MODULE)).href
    );
    const bundles = await compileDirectoryPlugin(directory, process.env.PASEO_VERSION);
    assert(bundles.clientBundle && bundles.serverBundle, "Both plugin bundles must compile");
    console.log(
      `Paseo compiled the artifact: client ${Buffer.byteLength(bundles.clientBundle)} bytes, ` +
        `server ${Buffer.byteLength(bundles.serverBundle)} bytes.`,
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `tarball=${tarball}\n`);
}
