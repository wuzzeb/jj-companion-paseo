import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

const windowSchema = z
  .object({
    id: z.number().int(),
    app_id: z.string().nullable(),
    pid: z.number().int().nullable(),
    workspace_id: z.number().int().nullable(),
  })
  .readonly();
const workspaceSchema = z
  .object({
    id: z.number().int(),
    name: z.string().nullable(),
    output: z.string().nullable(),
    active_window_id: z.number().int().nullable(),
  })
  .readonly();
const windowsSchema = z.object({ Windows: z.array(windowSchema).readonly() });
const workspacesSchema = z.object({ Workspaces: z.array(workspaceSchema).readonly() });
const replySchema = z.union([z.object({ Ok: z.unknown() }), z.object({ Err: z.string() })]);
type Reference = { readonly Id: number };
type NiriAction =
  | { readonly SetWorkspaceName: { readonly name: string; readonly workspace: Reference } }
  | {
      readonly MoveWindowToWorkspace: {
        readonly window_id: number;
        readonly reference: Reference;
        readonly focus: false;
      };
    }
  | { readonly FocusWorkspace: { readonly reference: Reference } };
export type NiriRequest = "Windows" | "Workspaces" | { readonly Action: NiriAction };

export async function requestNiri(
  socket: string,
  request: NiriRequest,
  signal: AbortSignal,
): Promise<unknown> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const connection = createConnection(socket);
    connection.setEncoding("utf8");
    let buffer = "";
    const finish = (error?: Error, value?: unknown) => {
      signal.removeEventListener("abort", abort);
      connection.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(new Error("Niri request cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    connection.setTimeout(2000, () => finish(new Error("Niri did not respond in time.")));
    connection.once("connect", () => connection.write(JSON.stringify(request) + "\n"));
    connection.once("error", (error) => finish(error));
    connection.once("end", () => finish(new Error("Niri closed its response.")));
    connection.on("data", (data: string) => {
      buffer += data;
      if (buffer.length > 1024 * 1024) {
        finish(new Error("Niri response exceeded the size limit."));
        return;
      }
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      try {
        const reply = replySchema.parse(JSON.parse(buffer.slice(0, end)));
        if ("Err" in reply) finish(new Error(reply.Err));
        else finish(undefined, reply.Ok);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

interface NiriOptions {
  readonly socket?: string | null;
  readonly request?: (request: NiriRequest, signal: AbortSignal) => Promise<unknown>;
  readonly windowTimeout?: number;
}

export function createNiriReview(options: NiriOptions = {}) {
  const socket = options.socket === undefined ? process.env.NIRI_SOCKET : options.socket;
  const request = options.request ?? ((request, signal) => requestNiri(socket!, request, signal));
  let pending: Promise<void> = Promise.resolve();

  async function arrange(
    appId: string,
    name: string,
    neovidePid: number | undefined,
    signal: AbortSignal,
  ) {
    const deadline = Date.now() + (options.windowTimeout ?? 3000);
    let windows = windowsSchema.parse(await request("Windows", signal)).Windows;
    const matches = () =>
      windows.filter(
        (window) =>
          window.app_id === appId || (neovidePid !== undefined && window.pid === neovidePid),
      );
    while (matches().length === 0) {
      if (Date.now() >= deadline)
        throw new Error("The managed Neovide window did not appear in Niri.");
      await delay(100, undefined, { signal });
      windows = windowsSchema.parse(await request("Windows", signal)).Windows;
    }
    const targets = matches();
    if (targets.length !== 1)
      throw new Error("More than one Niri window matches this review editor.");
    const window = targets[0];
    const workspaces = workspacesSchema.parse(await request("Workspaces", signal)).Workspaces;
    let target = workspaces.find((workspace) => workspace.name === name);
    if (!target) {
      const output = workspaces.find((workspace) => workspace.id === window.workspace_id)?.output;
      const empty = workspaces.filter(
        (workspace) =>
          workspace.name === null &&
          workspace.active_window_id === null &&
          !windows.some((window) => window.workspace_id === workspace.id),
      );
      const candidate = empty.find((workspace) => workspace.output === output) ?? empty[0];
      if (!candidate) throw new Error("Niri has no empty unnamed workspace available for review.");
      // Recheck before naming; workspace indices are ambiguous across monitors and can change.
      const freshWindows = windowsSchema.parse(await request("Windows", signal)).Windows;
      const freshWorkspaces = workspacesSchema.parse(
        await request("Workspaces", signal),
      ).Workspaces;
      const existing = freshWorkspaces.find((workspace) => workspace.name === name);
      if (existing) target = existing;
      else {
        const fresh = freshWorkspaces.find((workspace) => workspace.id === candidate.id);
        if (
          !fresh ||
          fresh.name !== null ||
          fresh.active_window_id !== null ||
          freshWindows.some((window) => window.workspace_id === candidate.id)
        )
          throw new Error("The empty Niri workspace changed before it could be named. Try again.");
        await request(
          { Action: { SetWorkspaceName: { name, workspace: { Id: candidate.id } } } },
          signal,
        );
        target = candidate;
      }
    }
    if (window.workspace_id !== target.id)
      await request(
        {
          Action: {
            MoveWindowToWorkspace: {
              window_id: window.id,
              reference: { Id: target.id },
              focus: false,
            },
          },
        },
        signal,
      );
    await request({ Action: { FocusWorkspace: { reference: { Id: target.id } } } }, signal);
  }

  return async (
    appId: string,
    name: string,
    neovidePid: number | undefined,
    signal: AbortSignal,
  ): Promise<string | undefined> => {
    if (!socket && !options.request) return undefined;
    const next = pending.catch(() => {}).then(() => arrange(appId, name, neovidePid, signal));
    pending = next;
    try {
      await next;
      return undefined;
    } catch (error) {
      return `Diff opened, but Niri workspace placement failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
}
