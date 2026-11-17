import { randomUUID } from "node:crypto";
import type { PluginHandlerContext, PluginSubscriptionContext } from "@getpaseo/plugin/server";
import type { RpcInput, SubscriptionInput } from "@getpaseo/plugin";
import {
  bookmarkActionRpc,
  bookmarkOperationSubscription,
  bookmarkStateRpc,
  isOperationComplete,
  type BookmarkOperation,
} from "../shared/bookmarks.js";
import { resolveRepository, sharedRepositoryPath } from "./repository.js";
import { readBookmarkState, runBookmarkAction } from "./bookmarks.js";

async function workspaceRoot(
  workspaceId: string,
  { paseo }: PluginHandlerContext,
  repository?: string,
) {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace || workspace.archivingAt) throw new Error("Workspace is unavailable.");
  return resolveRepository(workspace.workspaceDirectory, repository);
}

export function createBookmarkOperations() {
  const lifetime = new AbortController();
  const queues = new Map<string, Promise<void>>();
  const operations = new Map<
    string,
    {
      readonly workspaceId: string;
      readonly operation: BookmarkOperation;
      readonly listeners: Set<(operation: BookmarkOperation) => void>;
    }
  >();
  function update(operation: BookmarkOperation) {
    const entry = operations.get(operation.id);
    if (!entry) return;
    operations.set(operation.id, { ...entry, operation });
    for (const listener of entry.listeners) listener(operation);
  }
  return {
    async state(
      { workspaceId, repository }: RpcInput<typeof bookmarkStateRpc>,
      context: PluginHandlerContext,
    ) {
      const root = await workspaceRoot(workspaceId, context, repository);
      return root ? readBookmarkState(root, lifetime.signal) : null;
    },
    async start(
      { workspaceId, repository, action }: RpcInput<typeof bookmarkActionRpc>,
      context: PluginHandlerContext,
    ) {
      lifetime.signal.throwIfAborted();
      const root = await workspaceRoot(workspaceId, context, repository);
      if (!root) throw new Error("This workspace is not in a jj repository.");
      const key = await sharedRepositoryPath(root);
      for (const [id, entry] of operations) {
        if (operations.size < 100) break;
        if (isOperationComplete(entry.operation) && entry.listeners.size === 0)
          operations.delete(id);
      }
      const operation: BookmarkOperation = {
        id: randomUUID(),
        status: "queued",
        message: "Waiting for the repository…",
      };
      operations.set(operation.id, { workspaceId, operation, listeners: new Set() });
      const pending = (queues.get(key) ?? Promise.resolve())
        .then(async () => {
          try {
            lifetime.signal.throwIfAborted();
            const currentRoot = await workspaceRoot(workspaceId, context, repository);
            if (currentRoot !== root || (await sharedRepositoryPath(currentRoot)) !== key)
              throw new Error(
                "The workspace repository changed while this operation was queued. Refresh and try again.",
              );
            update({
              ...operation,
              status: "running",
              message: `${action.kind === "fetch" ? "Fetching" : action.kind === "push" ? "Pushing" : "Updating bookmarks"}…`,
            });
            const message = await runBookmarkAction(root, action, lifetime.signal);
            update({ ...operation, status: "succeeded", message });
          } catch (error) {
            update({
              ...operation,
              status: "failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        })
        .finally(() => {
          if (queues.get(key) === pending) queues.delete(key);
        });
      queues.set(key, pending);
      return { ...operation };
    },
    watch(
      { workspaceId, operationId }: SubscriptionInput<typeof bookmarkOperationSubscription>,
      context: Pick<PluginSubscriptionContext<BookmarkOperation>, "push" | "signal">,
    ): Promise<void> {
      // The hook stays mounted before the first action and after an operation finishes.
      if (operationId === null) return Promise.resolve();
      const entry = operations.get(operationId);
      if (!entry || entry.workspaceId !== workspaceId)
        throw new Error(
          "Operation is unavailable; refresh history to see the repository’s current state.",
        );
      const signal = AbortSignal.any([context.signal, lifetime.signal]);
      if (signal.aborted) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        let tail = Promise.resolve();
        let closed = false;
        const cleanup = () => {
          closed = true;
          entry.listeners.delete(send);
          signal.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          cleanup();
          resolve();
        };
        const send = (operation: BookmarkOperation) => {
          // Serialize pushes so a slow client receives immutable snapshots in order.
          tail = tail
            .then(() => (closed ? undefined : context.push(operation)))
            .then(() => {
              if (isOperationComplete(operation)) {
                cleanup();
                resolve();
              }
            })
            .catch((error: unknown) => {
              cleanup();
              reject(error);
            });
        };
        entry.listeners.add(send);
        signal.addEventListener("abort", onAbort, { once: true });
        // Reconnecting clients need the current state, including completed operations.
        send(entry.operation);
      });
    },
    async dispose() {
      lifetime.abort();
      await Promise.allSettled(queues.values());
    },
  };
}
