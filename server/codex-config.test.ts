import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { readCodexWritableRoots } from "./codex-config.js";

async function fixture(t: TestContext) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "paseo-codex-config-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = `
    const fs = require('node:fs');
    const lines = require('node:readline').createInterface({ input: fs.createReadStream(null, { fd: 0, autoClose: false }) });
    const send = (message) => fs.writeSync(1, JSON.stringify(message) + '\\n');
    lines.on('line', (line) => {
      fs.appendFileSync(process.env.REQUESTS, line + '\\n');
      const message = JSON.parse(line);
      if (message.id === 1) send({ id: 1, result: {} });
      if (message.id === 2) {
        if (process.env.HOLD_RESPONSE) {
          process.on('SIGTERM', () => process.exit(0));
          const child = "process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.env.READY, String(process.pid)); setInterval(() => {}, 1000);";
          require('node:child_process').spawn(process.execPath, ['-e', child], { stdio: 'inherit' });
        } else send({ id: 2, result: { config: { sandbox_workspace_write: { writable_roots: ['user-cache', 'project-cache'] } } } });
      }
    });
  `;
  if (process.platform === "win32") {
    await writeFile(join(directory, "codex-fixture.cjs"), source);
    await writeFile(
      join(directory, "codex.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0codex-fixture.cjs" %*\r\n`,
    );
  } else {
    const launcher = join(directory, "codex");
    await writeFile(launcher, `#!/usr/bin/env node\n${source}`);
    await chmod(launcher, 0o755);
  }
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"),
  );
  return {
    directory,
    env: {
      ...environment,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
      REQUESTS: join(directory, "requests.jsonl"),
      READY: join(directory, "ready"),
    },
  };
}

test("config/read works through the platform's Codex launcher and preserves resolved roots", async (t) => {
  const { directory, env } = await fixture(t);
  assert.deepEqual(
    await readCodexWritableRoots({ cwd: directory, env, signal: AbortSignal.timeout(5_000) }),
    ["user-cache", "project-cache"],
  );
  const requests = z.array(z.object({ method: z.string(), params: z.unknown().optional() })).parse(
    (await readFile(env.REQUESTS, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  );
  assert.deepEqual(
    requests.map((message) => message.method),
    ["initialize", "initialized", "config/read"],
  );
  assert.deepEqual(requests[2].params, { cwd: directory, includeLayers: false });
});

test("cancelled config/read waits for the launcher and resistant descendants to stop", async (t) => {
  const { directory, env } = await fixture(t);
  const controller = new AbortController();
  const reading = readCodexWritableRoots({
    cwd: directory,
    env: { ...env, HOLD_RESPONSE: "1" },
    signal: controller.signal,
  });
  let pid = 0;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        pid = Number(await readFile(env.READY, "utf8"));
        break;
      } catch {
        await delay(20);
      }
    }
    assert.ok(pid > 0, "the descendant must be ready before cancellation");
  } finally {
    controller.abort();
  }
  await assert.rejects(reading, { name: "AbortError" });
  if (process.platform === "linux") {
    try {
      assert.match(await readFile(`/proc/${pid}/stat`, "utf8"), /\) Z /);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  } else {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        process.kill(pid, 0);
      } catch {
        return;
      }
      await delay(20);
    }
    assert.fail("the Codex descendant must terminate after cancellation");
  }
});
