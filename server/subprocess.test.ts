import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { runSubprocess } from "./subprocess.js";

async function assertTerminated(pid: number) {
  // SIGKILL delivery and orphan reaping can briefly lag behind the cleanup call.
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if (process.platform === "linux") {
        if (/\) Z /.test(await readFile(`/proc/${pid}/stat`, "utf8"))) return;
      } else process.kill(pid, 0);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ESRCH")
      )
        return;
      throw error;
    }
    await delay(20);
  }
  assert.fail("the descendant must terminate after process-tree cleanup");
}

for (const stdio of ["ignore", "inherit"] as const) {
  test(
    `failed commands terminate resistant descendants with ${stdio} output`,
    { skip: process.platform === "win32" ? "POSIX process groups survive the parent exit" : false },
    async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "paseo-failed-process-"));
      const ready = join(directory, "ready");
      t.after(async () => {
        // Clean up even when the regression leaves the background process alive.
        try {
          process.kill(Number(await readFile(ready, "utf8")), "SIGKILL");
        } catch {
          // The process has already exited, or never started.
        }
        await rm(directory, { recursive: true, force: true });
      });
      const descendant = `
        process.on('SIGTERM', () => {});
        require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid));
        setInterval(() => {}, 1000);
      `;
      const launcher = `
        const fs = require('node:fs');
        require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: ${JSON.stringify(stdio)} }).unref();
        const wait = setInterval(() => {
          if (fs.existsSync(${JSON.stringify(ready)})) {
            clearInterval(wait);
            fs.writeSync(2, 'setup failed');
            process.exit(7);
          }
        }, 10);
      `;
      await assert.rejects(
        runSubprocess(process.execPath, ["-e", launcher], {
          cwd: directory,
          timeoutMs: 2_000,
        }),
        { message: "setup failed", code: 7 },
      );
      const pid = Number(await readFile(ready, "utf8"));
      await assertTerminated(pid);
    },
  );
}

test("cancellation waits for a resistant descendant even when its parent exits first", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-process-tree-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ready = join(directory, "ready");
  const descendant = `
    process.on('SIGTERM', () => {});
    require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid));
    setInterval(() => {}, 1000);
  `;
  const launcher = `
    process.on('SIGTERM', () => process.exit(0));
    require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'inherit' });
  `;
  const controller = new AbortController();
  const running = runSubprocess(process.execPath, ["-e", launcher], {
    cwd: directory,
    signal: controller.signal,
    timeoutMs: 10_000,
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
    assert.ok(pid > 0, "the descendant must be ready before cancellation");
  } finally {
    controller.abort();
  }
  await assert.rejects(running, /cancelled/);
  await assertTerminated(pid);
});

test("timeouts and output limits stop a live command instead of leaving it running", async () => {
  await assert.rejects(
    runSubprocess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      cwd: tmpdir(),
      timeoutMs: 50,
    }),
    /timed out/,
  );
  await assert.rejects(
    runSubprocess(
      process.execPath,
      ["-e", "require('node:fs').writeSync(1, 'x'.repeat(2048)); setInterval(() => {}, 1000)"],
      { cwd: tmpdir(), timeoutMs: 5_000, maxOutputBytes: 1024 },
    ),
    /output exceeded/,
  );
});

test("failed commands preserve exit codes and useful stderr for branch lookup", async () => {
  await assert.rejects(
    runSubprocess(
      process.execPath,
      ["-e", "require('node:fs').writeSync(2, 'missing ref'); process.exit(1)"],
      {
        cwd: tmpdir(),
        timeoutMs: 5_000,
      },
    ),
    { message: "missing ref", code: 1 },
  );
});
