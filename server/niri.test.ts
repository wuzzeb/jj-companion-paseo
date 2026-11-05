import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createNiriReview, requestNiri, type NiriRequest } from "./niri.js";

const signal = () => new AbortController().signal;
const appId = "paseo-jj-review-test";
interface Workspace {
  readonly id: number;
  readonly name: string | null;
  readonly output: string;
  readonly active_window_id: number | null;
}
interface Window {
  readonly id: number;
  readonly app_id: string;
  readonly pid: number;
  readonly workspace_id: number;
}
function desktop(named = false, oldAppId = false) {
  let windows: ReadonlyArray<Window> = [
    { id: 7, app_id: oldAppId ? "neovide" : appId, pid: 70, workspace_id: 1 },
    { id: 9, app_id: "unrelated", pid: 90, workspace_id: 2 },
  ];
  let workspaces: ReadonlyArray<Workspace> = [
    { id: 1, name: null, output: "DP-1", active_window_id: 7 },
    { id: 2, name: null, output: "DP-2", active_window_id: 9 },
    { id: 3, name: named ? "golden-otter" : null, output: "DP-1", active_window_id: null },
    { id: 4, name: null, output: "DP-2", active_window_id: null },
  ];
  let actions: ReadonlyArray<NiriRequest> = [];
  const request = async (request: NiriRequest) => {
    if (request === "Windows") return { Windows: windows };
    if (request === "Workspaces") return { Workspaces: workspaces };
    actions = [...actions, request];
    const action = request.Action;
    if ("SetWorkspaceName" in action)
      workspaces = workspaces.map((workspace) =>
        workspace.id === action.SetWorkspaceName.workspace.Id
          ? { ...workspace, name: action.SetWorkspaceName.name }
          : workspace,
      );
    if ("MoveWindowToWorkspace" in action)
      windows = windows.map((window) =>
        window.id === action.MoveWindowToWorkspace.window_id
          ? { ...window, workspace_id: action.MoveWindowToWorkspace.reference.Id }
          : window,
      );
    return "Handled";
  };
  return { request, actions: () => actions };
}

test("Niri names an empty workspace on the review window's output, moves only that window, then reuses the name", async () => {
  const state = desktop();
  const arrange = createNiriReview({ request: state.request });
  assert.equal(await arrange(appId, "golden-otter", undefined, signal()), undefined);
  assert.deepEqual(state.actions(), [
    { Action: { SetWorkspaceName: { name: "golden-otter", workspace: { Id: 3 } } } },
    { Action: { MoveWindowToWorkspace: { window_id: 7, reference: { Id: 3 }, focus: false } } },
    { Action: { FocusWorkspace: { reference: { Id: 3 } } } },
  ]);
  assert.equal(await arrange(appId, "golden-otter", undefined, signal()), undefined);
  assert.deepEqual(state.actions().at(-1), {
    Action: { FocusWorkspace: { reference: { Id: 3 } } },
  });
  assert.equal(state.actions().length, 4);
});

test("Niri reuses an existing named workspace and recognizes older managed windows by acknowledged Neovide PID", async () => {
  const state = desktop(true, true);
  const arrange = createNiriReview({ request: state.request });
  assert.equal(await arrange(appId, "golden-otter", 70, signal()), undefined);
  assert.deepEqual(state.actions(), [
    { Action: { MoveWindowToWorkspace: { window_id: 7, reference: { Id: 3 }, focus: false } } },
    { Action: { FocusWorkspace: { reference: { Id: 3 } } } },
  ]);
});

test("Niri does not name a workspace occupied between discovery and placement", async () => {
  const state = desktop();
  let queries = 0;
  const arrange = createNiriReview({
    request: async (request) => {
      const result = await state.request(request);
      if (
        request === "Windows" &&
        ++queries === 2 &&
        typeof result === "object" &&
        result.Windows !== undefined
      )
        return {
          Windows: [...result.Windows, { id: 10, app_id: "new", pid: 100, workspace_id: 3 }],
        };
      return result;
    },
  });
  assert.match(
    (await arrange(appId, "golden-otter", undefined, signal()))!,
    /empty Niri workspace changed/,
  );
  assert.deepEqual(state.actions(), []);
});

test("Niri absence, unavailable windows, and IPC errors never turn a completed diff into an exception", async () => {
  const disabled = createNiriReview({ socket: null });
  assert.equal(await disabled(appId, "golden-otter", undefined, signal()), undefined);
  const missing = createNiriReview({ request: async () => ({ Windows: [] }), windowTimeout: 0 });
  assert.match(
    (await missing(appId, "golden-otter", undefined, signal()))!,
    /Diff opened, but Niri/,
  );
  const failed = createNiriReview({
    request: async () => {
      throw new Error("Disconnected");
    },
  });
  assert.match((await failed(appId, "golden-otter", undefined, signal()))!, /Disconnected/);
});

test("Niri IPC reads fragmented UTF-8 replies and reports compositor errors", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "jj-niri-test-"));
  const socket = join(directory, "niri.sock");
  let fail = false;
  const server = createServer((connection) =>
    connection.once("data", () => {
      const response = Buffer.from(
        JSON.stringify(fail ? { Err: "No workspace" } : { Ok: { name: "café" } }) + "\n",
      );
      const split = response.indexOf(Buffer.from("é")) + 1;
      connection.write(response.subarray(0, split));
      setImmediate(() => connection.end(response.subarray(split)));
    }),
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, resolve);
  });
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  assert.deepEqual(await requestNiri(socket, "Workspaces", signal()), { name: "café" });
  fail = true;
  await assert.rejects(requestNiri(socket, "Workspaces", signal()), /No workspace/);
});
