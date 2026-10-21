import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { runJj } from "./jj.js";

test(
  "cancelling jj also terminates a spawned child that ignores SIGTERM",
  { skip: process.platform === "win32" },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "paseo-jj-cancel-"));
    const previousPath = process.env.PATH;
    t.after(async () => {
      process.env.PATH = previousPath;
      await rm(directory, { recursive: true, force: true });
    });
    const ready = join(directory, "ready");
    const childScript = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(() => {}, 1000);`;
    const launcher = join(directory, "jj");
    await writeFile(
      launcher,
      `#!/usr/bin/env node\nprocess.on('SIGTERM', () => process.exit(0)); require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], {stdio:'inherit'});\n`,
    );
    await chmod(launcher, 0o755);
    process.env.PATH = `${directory}:${previousPath}`;
    const controller = new AbortController();
    const pending = runJj(directory, ["git", "fetch"], {
      readOnly: false,
      network: true,
      signal: controller.signal,
    });
    let pid = 0;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          pid = Number(await readFile(ready, "utf8"));
          break;
        } catch {
          await delay(20);
        }
      }
      assert.ok(pid > 0, "the descendant must be running before cancellation");
    } finally {
      controller.abort();
    }
    await assert.rejects(pending, /cancelled/);
    if (process.platform === "linux") {
      try {
        assert.match(
          await readFile(`/proc/${pid}/stat`, "utf8"),
          /\) Z /,
          "a remaining process record must be a terminated zombie",
        );
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    } else {
      assert.throws(() => process.kill(pid, 0));
    }
  },
);
