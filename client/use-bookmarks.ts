import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, useSubscription } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import {
  bookmarkActionRpc,
  bookmarkOperationSubscription,
  bookmarkStateRpc,
  isOperationComplete,
  type BookmarkAction,
  type BookmarkOperation,
} from "../shared/bookmarks.js";

export function useBookmarks(
  workspaceId: string,
  hostId: string,
  directory: string | null,
  repository: string,
  enabled: boolean,
) {
  const stateRpc = useRpc(bookmarkStateRpc);
  const startRpc = useRpc(bookmarkActionRpc);
  const client = useQueryClient();
  const toast = useToast();
  const [operation, setOperation] = useState<BookmarkOperation | null>(null);
  const handled = useRef<string | null>(null);
  const state = useQuery({
    queryKey: ["jj-bookmarks", hostId, workspaceId, directory, repository],
    queryFn: () => stateRpc({ workspaceId, repository }),
    refetchInterval: 10_000,
    enabled,
    retry: false,
  });
  const subscription = useSubscription(
    bookmarkOperationSubscription,
    { workspaceId, operationId: operation?.id ?? null },
    (event) => setOperation((current) => (current?.id === event.id ? event : current)),
  );
  const start = useMutation({
    mutationFn: (action: BookmarkAction) => startRpc({ workspaceId, repository, action }),
    onSuccess: setOperation,
    onError: (error) => toast.error(error.message),
    retry: false,
  });
  useEffect(() => {
    const result = operation;
    if (!result || !isOperationComplete(result) || handled.current === result.id) return;
    handled.current = result.id;
    if (result.status === "failed") toast.error(result.message);
    else toast.show(result.message, { variant: "success" });
    void client.invalidateQueries({ queryKey: ["jj-history", hostId, workspaceId] });
    void client.invalidateQueries({ queryKey: ["jj-bookmarks", hostId, workspaceId] });
  }, [operation, client, toast, hostId, workspaceId]);
  const subscriptionError =
    subscription.status === "error" ? subscription.error.message : undefined;
  const busy =
    start.isPending || Boolean(operation && !subscriptionError && !isOperationComplete(operation));
  return {
    state,
    run: start.mutateAsync,
    busy,
    activeAction: busy ? start.variables?.kind : undefined,
    pendingAction: busy ? start.variables : undefined,
    operation: operation ?? undefined,
    error: subscriptionError ?? start.error?.message,
  };
}
