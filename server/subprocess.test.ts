import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { runSubprocess } from "./subprocess.js";

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
  if (process.platform === "linux") {
    try {
      assert.match(await readFile(`/proc/${pid}/stat`, "utf8"), /\) Z /);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  } else {
    // An orphan can briefly remain visible while macOS's init reaps it.
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        process.kill(pid, 0);
      } catch {
        return;
      }
      await delay(20);
    }
    assert.fail("the descendant must terminate after cancellation");
  }
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
