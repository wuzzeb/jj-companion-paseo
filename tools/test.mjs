import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("..", import.meta.url));
const tests = (
  await Promise.all(
    ["server", "client"].map(async (part) =>
      (await readdir(join(directory, part)))
        .filter((file) => file.endsWith(".test.ts"))
        .sort()
        .map((file) => join(part, file)),
    ),
  )
).flat();

// Pass explicit paths: Windows command shells do not expand the package script's
// globs, and glob support in Node's test runner differs between supported versions.
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...tests], {
  cwd: directory,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
