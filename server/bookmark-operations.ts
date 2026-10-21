import { randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import {
  bookmarkActionRpc,
  bookmarkOperationRpc,
  bookmarkStateRpc,
  type BookmarkOperation,
} from "../shared/bookmarks.js";
import { findJjRoot } from "./repository.js";
import { readBookmarkState, runBookmarkAction } from "./bookmarks.js";

async function workspaceRoot(workspaceId: string, { paseo }: PluginHandlerContext) {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace || workspace.archivingAt) throw new Error("Workspace is unavailable.");
  return findJjRoot(await realpath(workspace.workspaceDirectory));
}

async function repositoryKey(root: string) {
  const path = join(root, ".jj", "repo");
  return realpath(
    (await stat(path)).isDirectory()
      ? path
      : resolve(dirname(path), (await readFile(path, "utf8")).trim()),
  );
}

export function createBookmarkOperations() {
  const lifetime = new AbortController();
  const queues = new Map<string, Promise<void>>();
  const operations = new Map<string, { workspaceId: string; operation: BookmarkOperation }>();
  return {
    async state({ workspaceId }: RpcInput<typeof bookmarkStateRpc>, context: PluginHandlerContext) {
      const root = await workspaceRoot(workspaceId, context);
      return root ? readBookmarkState(root, lifetime.signal) : null;
    },
    async start(
      { workspaceId, action }: RpcInput<typeof bookmarkActionRpc>,
      context: PluginHandlerContext,
    ) {
      lifetime.signal.throwIfAborted();
      const root = await workspaceRoot(workspaceId, context);
      if (!root) throw new Error("This workspace is not in a jj repository.");
      const key = await repositoryKey(root);
      for (const [id, entry] of operations) {
        if (operations.size < 100) break;
        if (["succeeded", "failed"].includes(entry.operation.status)) operations.delete(id);
      }
      const operation: BookmarkOperation = {
        id: randomUUID(),
        status: "queued",
        message: "Waiting for the repository…",
      };
      operations.set(operation.id, { workspaceId, operation });
      const pending = (queues.get(key) ?? Promise.resolve())
        .then(async () => {
          try {
            lifetime.signal.throwIfAborted();
            const currentRoot = await workspaceRoot(workspaceId, context);
            if (currentRoot !== root || (await repositoryKey(currentRoot)) !== key)
              throw new Error(
                "The workspace repository changed while this operation was queued. Refresh and try again.",
              );
            operation.status = "running";
            operation.message = `${action.kind === "fetch" ? "Fetching" : action.kind === "push" ? "Pushing" : "Updating bookmarks"}…`;
            operation.message = await runBookmarkAction(root, action, lifetime.signal);
            operation.status = "succeeded";
          } catch (error) {
            operation.status = "failed";
            operation.message = error instanceof Error ? error.message : String(error);
          }
        })
        .finally(() => {
          if (queues.get(key) === pending) queues.delete(key);
        });
      queues.set(key, pending);
      return { ...operation };
    },
    operation({ workspaceId, operationId }: RpcInput<typeof bookmarkOperationRpc>) {
      const entry = operations.get(operationId);
      if (!entry || entry.workspaceId !== workspaceId)
        throw new Error(
          "Operation is unavailable; refresh history to see the repository’s current state.",
        );
      return { ...entry.operation };
    },
    async dispose() {
      lifetime.abort();
      await Promise.allSettled(queues.values());
    },
  };
}
