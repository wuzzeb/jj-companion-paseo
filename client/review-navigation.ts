import type { ReviewTarget } from "../shared/review.js";

export interface ReviewRequest {
  readonly id: string;
  readonly repository: string;
  readonly target: ReviewTarget;
}

// Paseo's openPanel has no initial-state argument; retain the request until the tab observes it.
export function createReviewNavigation(openPanel: (workspaceId: string) => void) {
  const requests = new Map<string, ReviewRequest>();
  const listeners = new Set<() => void>();
  const prefix = Math.random().toString(36).slice(2);
  let sequence = 0;
  const key = (hostId: string, workspaceId: string) => JSON.stringify([hostId, workspaceId]);
  return {
    get(hostId: string, workspaceId: string) {
      return requests.get(key(hostId, workspaceId)) ?? null;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open(hostId: string, workspaceId: string, repository: string, target: ReviewTarget) {
      requests.set(key(hostId, workspaceId), { id: `${prefix}:${++sequence}`, repository, target });
      for (const listener of listeners) listener();
      openPanel(workspaceId);
    },
    dispose() {
      requests.clear();
      listeners.clear();
    },
  };
}
export type ReviewNavigation = ReturnType<typeof createReviewNavigation>;
