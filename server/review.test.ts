import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { createReviewLauncher, reviewExpression } from "./review.js";

const execute = promisify(execFile);
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "jj-review-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = join(directory, "workspace");
  await mkdir(join(workspace, ".jj"), { recursive: true });
  await mkdir(join(workspace, "child", ".jj"), { recursive: true });
  return { directory, workspace, socketDirectory: join(directory, "sockets") };
}

test("concurrent root and child review requests share one managed window; sibling workspaces do not", async (t) => {
  const { workspace, directory, socketDirectory } = await fixture(t);
  const sockets = new Set<string>();
  let launched: ReadonlyArray<string> = [];
  let commands: ReadonlyArray<string> = [];
  let starting = true;
  const review = createReviewLauncher({
    niriSocket: null,
    socketDirectory,
    available: async (socket) => sockets.has(socket),
    launch: (workspace, socket) => {
      launched = [...launched, workspace];
      sockets.add(socket);
      return () => null;
    },
    send: async (_, expression) => {
      if (starting) {
        starting = false;
        return '{"status":"starting"}';
      }
      commands = [...commands, expression];
      return '{"status":"ready"}';
    },
  });
  t.after(() => review.dispose());
  const branch = review.branch;
  const context = {
    paseo: {
      workspaces: { ref: () => ({ refresh: async () => ({ workspaceDirectory: workspace }) }) },
    },
  } as unknown as PluginHandlerContext;
  const results = await Promise.all([
    branch({ workspaceId: "test" }, context),
    branch({ workspaceId: "test", repository: "child" }, context),
  ]);
  assert.deepEqual(results, [{ launched: true }, { launched: false }]);
  assert.deepEqual(launched, [workspace]);
  assert.equal(commands.length, 2);
  assert.notEqual(commands[0], commands[1]);
  const sibling = join(directory, "sibling");
  await mkdir(sibling);
  assert.deepEqual(await review.open(sibling, sibling), { launched: true });
  assert.deepEqual(launched, [workspace, sibling]);
  await assert.rejects(
    branch({ workspaceId: "test", repository: "missing" }, context),
    /unavailable/,
  );
  assert.equal(launched.length, 2);
});

test("reload reuses its existing window and a closed editor can be relaunched", async (t) => {
  const { workspace, socketDirectory } = await fixture(t);
  const sockets = new Set<string>();
  let launches = 0;
  const options = {
    niriSocket: null,
    socketDirectory,
    available: async (socket: string) => sockets.has(socket),
    launch: (_: string, socket: string) => {
      launches++;
      sockets.add(socket);
      return () => null;
    },
    send: async () => '{"status":"ready"}',
  };
  const first = createReviewLauncher(options);
  await first.open(workspace, workspace);
  await first.dispose();
  const reloaded = createReviewLauncher(options);
  t.after(() => reloaded.dispose());
  assert.deepEqual(await reloaded.open(workspace, workspace), { launched: false });
  assert.equal(launches, 1);
  sockets.clear();
  assert.deepEqual(await reloaded.open(workspace, workspace), { launched: true });
  assert.equal(launches, 2);
});

test("startup errors and existing-editor errors are surfaced without duplicate launches", async (t) => {
  const { workspace, socketDirectory } = await fixture(t);
  const failed = createReviewLauncher({
    niriSocket: null,
    socketDirectory,
    available: async () => false,
    launch: () => () => new Error("No desktop session"),
  });
  await assert.rejects(failed.open(workspace, workspace), /No desktop session/);
  await failed.dispose();
  let launches = 0;
  const existing = createReviewLauncher({
    niriSocket: null,
    socketDirectory,
    available: async () => true,
    launch: () => {
      launches++;
      return () => null;
    },
    send: async () => '{"status":"error","message":"Wrong workspace or unavailable diffview"}',
  });
  t.after(() => existing.dispose());
  await assert.rejects(existing.open(workspace, workspace), /Wrong workspace/);
  assert.equal(launches, 0);
  const timeout = createReviewLauncher({
    niriSocket: null,
    socketDirectory,
    available: async () => false,
    launch: () => () => null,
    startupTimeout: 0,
  });
  await assert.rejects(timeout.open(workspace, workspace), /did not become ready/);
  await timeout.dispose();
});

test("real Neovim RPC preserves literal repository arguments, checks ownership, and acknowledges view errors", async (t) => {
  const { directory, socketDirectory } = await fixture(t);
  try {
    await execute("nvim", ["--version"], {
      cwd: directory,
      env: { ...process.env, NVIM_LOG_FILE: join(directory, "nvim.log") },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      t.skip("nvim is not installed");
      return;
    }
    throw error;
  }
  const workspace = join(directory, "work space's café");
  await mkdir(workspace);
  await mkdir(socketDirectory);
  const socket = join(socketDirectory, "test.sock");
  const init = join(directory, "init.lua");
  await writeFile(
    init,
    `
vim.g.paseo_jj_review_workspace = vim.env.PASEO_JJ_REVIEW_WORKSPACE
package.preload['diffview'] = function() return {} end
package.preload['diffview.lib'] = function() return {
  diffview_open = function(args)
    if vim.g.fail_review then return nil end
    vim.g.review_args = args
    return {open=function() vim.g.review_count = (vim.g.review_count or 0) + 1 end}
  end
} end
`,
  );
  const child = spawn("nvim", ["-u", init, "-i", "NONE", "-n", "--headless", "--listen", socket], {
    cwd: workspace,
    stdio: "ignore",
    env: {
      ...process.env,
      PASEO_JJ_REVIEW_WORKSPACE: workspace,
      NVIM_LOG_FILE: join(directory, "nvim.log"),
    },
  });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  t.after(async () => {
    child.kill("SIGTERM");
    await exited;
  });
  const rpc = async (expression: string) => {
    const { stdout } = await execute("nvim", ["--server", socket, "--remote-expr", expression], {
      cwd: workspace,
      timeout: 2000,
      env: { ...process.env, NVIM_LOG_FILE: join(directory, "nvim.log") },
    });
    return stdout.trim();
  };
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await rpc("v:vim_did_enter")) === "1") {
        ready = true;
        break;
      }
    } catch {
      /* The new server may not be listening yet. */
    }
    await delay(25);
  }
  assert.ok(ready, "the scratch Neovim must finish startup");
  assert.deepEqual(JSON.parse(await rpc(reviewExpression(workspace, workspace))), {
    status: "ready",
  });
  assert.deepEqual(JSON.parse(await rpc('luaeval("vim.json.encode(vim.g.review_args)")')), [
    "fork_point(main|@)",
    `-C${workspace}`,
    "--adapter=jj",
  ]);
  assert.deepEqual(JSON.parse(await rpc(reviewExpression(workspace, join(workspace, "child")))), {
    status: "ready",
  });
  assert.equal(await rpc("g:review_count"), "2");
  const range = "a".repeat(40) + ".." + "b".repeat(40);
  assert.equal(
    JSON.parse(await rpc(reviewExpression(workspace, workspace, range))).status,
    "ready",
  );
  assert.deepEqual(JSON.parse(await rpc('luaeval("vim.json.encode(vim.g.review_args)")')), [
    range,
    `-C${workspace}`,
    "--adapter=jj",
  ]);
  assert.equal(JSON.parse(await rpc(reviewExpression("unrelated", workspace))).status, "error");
  await rpc('luaeval("(function() vim.g.fail_review=true; return true end)()")');
  const failure = JSON.parse(await rpc(reviewExpression(workspace, workspace)));
  assert.equal(failure.status, "error");
  assert.match(failure.message, /could not open/);
});

test("Niri failure returns a warning after the diff opens", async (t) => {
  const { workspace, directory, socketDirectory } = await fixture(t);
  let opened = false;
  const review = createReviewLauncher({
    socketDirectory,
    niriSocket: join(directory, "missing-niri.sock"),
    available: async () => true,
    send: async () => {
      opened = true;
      return '{"status":"ready"}';
    },
  });
  t.after(() => review.dispose());
  const result = await review.open(workspace, workspace);
  assert.equal(opened, true);
  assert.equal(result.launched, false);
  assert.match(result.warning!, /Diff opened, but Niri workspace placement failed/);
});

test("Niri review separates project directories with the same Paseo nickname, including nested repositories", async (t) => {
  const { directory, socketDirectory } = await fixture(t);
  const niriSocket = join(directory, "niri.sock");
  const projects = ["project-a-golden-otter", "project-b-golden-otter"];
  let actions: ReadonlyArray<unknown> = [];
  const server = createServer((connection) => {
    connection.setEncoding("utf8");
    let buffer = "";
    connection.on("data", (data: string) => {
      buffer += data;
      if (!buffer.includes("\n")) return;
      const request: unknown = JSON.parse(buffer.trim());
      const response =
        request === "Windows"
          ? { Windows: [{ id: 7, app_id: "neovide", pid: 70, workspace_id: 1 }] }
          : request === "Workspaces"
            ? {
                Workspaces: ["golden-otter", ...projects].map((name, index) => ({
                  id: index + 1,
                  name,
                  output: "DP-1",
                  active_window_id: index === 0 ? 7 : null,
                })),
              }
            : "Handled";
      if (typeof request === "object") actions = [...actions, request];
      connection.end(JSON.stringify({ Ok: response }) + "\n");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(niriSocket, resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const review = createReviewLauncher({
    socketDirectory,
    niriSocket,
    available: async () => true,
    send: async () => '{"status":"ready","neovidePid":70}',
  });
  t.after(() => review.dispose());
  for (const [index, project] of projects.entries()) {
    const workspace = join(directory, project);
    await mkdir(join(workspace, "child", ".jj"), { recursive: true });
    await mkdir(join(workspace, ".jj"));
    const context = {
      paseo: {
        workspaces: {
          ref: () => ({
            refresh: async () => ({
              workspaceDirectory: workspace,
              name: "golden-otter",
            }),
          }),
        },
      },
    } as unknown as PluginHandlerContext;
    for (const repository of [undefined, "child"]) {
      assert.deepEqual(await review.branch({ workspaceId: "test", repository }, context), {
        launched: false,
      });
      assert.deepEqual(actions.slice(-2), [
        {
          Action: {
            MoveWindowToWorkspace: { window_id: 7, reference: { Id: index + 2 }, focus: false },
          },
        },
        { Action: { FocusWorkspace: { reference: { Id: index + 2 } } } },
      ]);
    }
  }
});

test(
  "an upgrade to XDG_RUNTIME_DIR reuses a private legacy socket",
  { skip: process.platform === "win32" },
  async (t) => {
    const { workspace, directory } = await fixture(t);
    const runtime = join(directory, "runtime");
    await mkdir(runtime, { mode: 0o700 });
    const previousRuntime = process.env.XDG_RUNTIME_DIR;
    const previousTemporary = process.env.TMPDIR;
    const legacy = join(directory, `paseo-jj-review-${process.getuid!()}`);
    await mkdir(legacy, { mode: 0o700 });
    const key = createHash("sha256").update(workspace).digest("hex").slice(0, 24);
    const oldSocket = join(legacy, `${key}.sock`);
    try {
      process.env.XDG_RUNTIME_DIR = runtime;
      process.env.TMPDIR = directory;
      const review = createReviewLauncher({
        niriSocket: null,
        available: async (socket) => socket === oldSocket,
        launch: () => {
          throw new Error("An existing editor must not be duplicated");
        },
        send: async (socket) => {
          assert.equal(socket, oldSocket);
          return '{"status":"ready"}';
        },
      });
      try {
        assert.deepEqual(await review.open(workspace, workspace), { launched: false });
      } finally {
        await review.dispose();
      }
    } finally {
      if (previousRuntime === undefined) delete process.env.XDG_RUNTIME_DIR;
      else process.env.XDG_RUNTIME_DIR = previousRuntime;
      if (previousTemporary === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTemporary;
    }
  },
);
