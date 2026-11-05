import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, realpath, unlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { reviewBranchRpc } from "../shared/review.js";
import { createNiriReview } from "./niri.js";
import { findJjRoot, resolveRepository } from "./repository.js";
import {
  ensureReviewDirectory,
  legacyReviewDirectory,
  reviewDirectory,
} from "./review-directory.js";

const execute = promisify(execFile);
const identity = "vim.g.paseo_jj_review_workspace";
const resultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), neovidePid: z.number().int().positive().optional() }),
  z.object({ status: z.literal("starting") }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

// Data travels through json_decode/_A, never through shell or Ex command interpolation.
function expression(code: string, data: unknown) {
  return `luaeval(${JSON.stringify(code)}, json_decode(${JSON.stringify(JSON.stringify(data))}))`;
}

export function reviewExpression(workspace: string, repository: string) {
  return expression(
    `(function()
    if vim.v.vim_did_enter == 0 then return vim.json.encode({status='starting'}) end
    if ${identity} ~= _A.workspace then
      return vim.json.encode({status='error', message='This editor is not managed by jj Companion for this workspace.'})
    end
    local ok, diffview = pcall(require, 'diffview')
    if not ok then return vim.json.encode({status='error', message='diffview-plus.nvim could not be loaded: '..tostring(diffview)}) end
    local opened, err = pcall(function()
      local view = require('diffview.lib').diffview_open({'fork_point(main|@)', '-C'.._A.repository, '--adapter=jj'})
      if not view then error('Diffview could not open the branch comparison. Check :messages in Neovide.') end
      if not (view.tabpage and vim.api.nvim_tabpage_is_valid(view.tabpage)) then view:open() end
    end)
    if not opened then return vim.json.encode({status='error', message=tostring(err)}) end
    return vim.json.encode({status='ready', neovidePid=vim.g.neovide and vim.uv.os_getppid() or nil})
  end)()`,
    { workspace, repository },
  );
}

async function socketAvailable(socket: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(socket);
    connection.setTimeout(1500);
    connection.once("connect", () => {
      connection.destroy();
      resolve(true);
    });
    connection.once("timeout", () => {
      connection.destroy();
      reject(new Error("The review editor is not responding. Try again when it is ready."));
    });
    connection.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ECONNREFUSED") resolve(false);
      else reject(error);
    });
  });
}

function launchNeovide(workspace: string, socket: string, appId: string) {
  let failure: Error | null = null;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PASEO_JJ_REVIEW_WORKSPACE: workspace,
    NVIM_LOG_FILE: join(dirname(socket), "nvim.log"),
  };
  // An inherited target must not attach our new GUI to an unrelated editor.
  delete environment.NEOVIDE_SERVER;
  delete environment.NVIM;
  const child = spawn(
    "neovide",
    [
      "--no-fork",
      "--wayland-app-id",
      appId,
      "--x11-wm-class",
      appId,
      "--",
      "--listen",
      socket,
      "--cmd",
      `lua ${identity}=vim.env.PASEO_JJ_REVIEW_WORKSPACE`,
    ],
    {
      cwd: workspace,
      env: environment,
      detached: true,
      stdio: "ignore",
    },
  );
  child.once("error", (error) => {
    failure = new Error(`Could not launch Neovide: ${error.message}`);
  });
  child.once("exit", (code, signal) => {
    failure = new Error(
      `Neovide exited before review opened (${signal ?? code}). Check the daemon's desktop session environment.`,
    );
  });
  child.unref();
  return () => failure;
}

interface ReviewOptions {
  readonly socketDirectory?: string;
  readonly available?: (socket: string) => Promise<boolean>;
  readonly niriSocket?: string | null;
  readonly launch?: (workspace: string, socket: string, appId: string) => () => Error | null;
  readonly send?: (socket: string, expression: string, signal: AbortSignal) => Promise<string>;
  readonly startupTimeout?: number;
}

export function createReviewLauncher(options: ReviewOptions = {}) {
  const lifetime = new AbortController();
  const queues = new Map<
    string,
    Promise<{ readonly launched: boolean; readonly warning?: string }>
  >();
  const directory = async () => options.socketDirectory ?? (await reviewDirectory());
  const arrange = createNiriReview({ socket: options.niriSocket });
  const available = options.available ?? socketAvailable;
  const launch = options.launch ?? launchNeovide;
  const send =
    options.send ??
    (async (socket, expression, signal) => {
      const { stdout } = await execute("nvim", ["--server", socket, "--remote-expr", expression], {
        timeout: 4000,
        maxBuffer: 64 * 1024,
        signal,
        env: { ...process.env, NVIM_LOG_FILE: join(await directory(), "nvim.log") },
      });
      return stdout;
    });

  async function open(workspace: string, repository: string, name: string) {
    lifetime.signal.throwIfAborted();
    const socketDirectory = await directory();
    await ensureReviewDirectory(socketDirectory);
    const key = createHash("sha256").update(workspace).digest("hex").slice(0, 24);
    let socket = join(socketDirectory, `${key}.sock`);
    const appId = `paseo-jj-review-${key}`;
    let launched = !(await available(socket));
    if (launched && !options.socketDirectory && socketDirectory !== legacyReviewDirectory()) {
      const legacy = legacyReviewDirectory();
      const exists = await lstat(legacy).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (exists) {
        await ensureReviewDirectory(legacy);
        const previousSocket = join(legacy, `${key}.sock`);
        if (await available(previousSocket)) {
          socket = previousSocket;
          launched = false;
        }
      }
    }
    let failure: () => Error | null = () => null;
    if (launched) {
      await unlink(socket).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      failure = launch(workspace, socket, appId);
    }
    const deadline = Date.now() + (options.startupTimeout ?? 15_000);
    while (true) {
      lifetime.signal.throwIfAborted();
      const error = failure();
      if (error) throw error;
      if (await available(socket)) {
        const result = resultSchema.parse(
          JSON.parse(await send(socket, reviewExpression(workspace, repository), lifetime.signal)),
        );
        if (result.status === "ready") {
          const warning = await arrange(appId, name, result.neovidePid, lifetime.signal);
          return { launched, ...(warning ? { warning } : {}) };
        }
        if (result.status === "error") throw new Error(result.message);
      } else if (!launched) {
        throw new Error("The review editor closed. Try again to launch a new window.");
      }
      if (Date.now() >= deadline)
        throw new Error(
          "Neovide did not become ready in time. Retry to reuse the window once startup finishes.",
        );
      await delay(100, undefined, { signal: lifetime.signal });
    }
  }

  async function enqueue(workspace: string, repository: string, name = basename(workspace)) {
    const canonical = await realpath(workspace);
    const previous = queues.get(canonical) ?? Promise.resolve({ launched: false });
    const pending = previous
      .catch(() => {})
      .then(() => open(canonical, repository, name))
      .finally(() => {
        if (queues.get(canonical) === pending) queues.delete(canonical);
      });
    queues.set(canonical, pending);
    return pending;
  }

  return {
    open: enqueue,
    async branch(
      { workspaceId, repository }: RpcInput<typeof reviewBranchRpc>,
      { paseo }: PluginHandlerContext,
    ) {
      const workspace = await paseo.workspaces.ref(workspaceId).refresh();
      if (!workspace || workspace.archivingAt) throw new Error("Workspace is unavailable.");
      const directory = await realpath(workspace.workspaceDirectory);
      const root = await findJjRoot(directory);
      const selected = await resolveRepository(directory, repository);
      if (!root || !selected) throw new Error("This workspace is not in a jj repository.");
      return enqueue(root, selected, workspace.name?.trim() || basename(root));
    },
    async dispose() {
      lifetime.abort();
      await Promise.allSettled(queues.values());
    },
  };
}
