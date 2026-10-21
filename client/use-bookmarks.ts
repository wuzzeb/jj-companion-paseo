import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import {
  bookmarkActionRpc,
  bookmarkOperationRpc,
  bookmarkStateRpc,
  type BookmarkAction,
} from "../shared/bookmarks.js";

export function useBookmarks(workspaceId: string, hostId: string, directory: string | null) {
  const stateRpc = useRpc(bookmarkStateRpc);
  const startRpc = useRpc(bookmarkActionRpc);
  const operationRpc = useRpc(bookmarkOperationRpc);
  const client = useQueryClient();
  const toast = useToast();
  const [operationId, setOperationId] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const state = useQuery({
    queryKey: ["jj-bookmarks", hostId, workspaceId, directory],
    queryFn: () => stateRpc({ workspaceId }),
    refetchInterval: 10_000,
    retry: false,
  });
  const operation = useQuery({
    queryKey: ["jj-bookmark-operation", hostId, workspaceId, operationId],
    queryFn: () => operationRpc({ workspaceId, operationId: operationId! }),
    enabled: operationId !== null,
    refetchInterval: (query) =>
      ["succeeded", "failed"].includes(query.state.data?.status ?? "") ? false : 600,
    retry: false,
  });
  const start = useMutation({
    mutationFn: (action: BookmarkAction) => startRpc({ workspaceId, action }),
    onSuccess: (result) => setOperationId(result.id),
    onError: (error) => toast.error(error.message),
    retry: false,
  });
  useEffect(() => {
    const result = operation.data;
    if (
      !result ||
      !["succeeded", "failed"].includes(result.status) ||
      handled.current === result.id
    )
      return;
    handled.current = result.id;
    if (result.status === "failed") toast.error(result.message);
    else toast.show(result.message, { variant: "success" });
    void client.invalidateQueries({ queryKey: ["jj-history", hostId, workspaceId] });
    void client.invalidateQueries({ queryKey: ["jj-bookmarks", hostId, workspaceId] });
  }, [operation.data, client, toast, hostId, workspaceId]);
  const busy =
    start.isPending ||
    Boolean(
      operationId &&
      !operation.isError &&
      !["succeeded", "failed"].includes(operation.data?.status ?? ""),
    );
  return {
    state,
    run: start.mutateAsync,
    busy,
    activeAction: busy ? start.variables?.kind : undefined,
    operation: operation.data,
    error: operation.error?.message ?? start.error?.message,
  };
}
