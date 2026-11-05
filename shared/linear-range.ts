interface RevisionNode {
  readonly commitId: string;
  readonly parents: ReadonlyArray<string>;
}

// Follow ancestry rather than row positions: neighboring rows may belong to other branches.
export function linearRange<T extends RevisionNode>(
  changes: ReadonlyArray<T>,
  anchor: string,
  end: string,
): ReadonlyArray<T> | null {
  const byId = new Map(changes.map((change) => [change.commitId, change]));
  const walk = (newest: string, oldest: string): ReadonlyArray<T> | null => {
    const path: T[] = [];
    const seen = new Set<string>();
    let next = byId.get(newest);
    while (next && !seen.has(next.commitId)) {
      seen.add(next.commitId);
      path.push(next);
      if (next.commitId === oldest) return path;
      if (next.parents.length !== 1) break;
      next = byId.get(next.parents[0]);
    }
    return null;
  };
  return walk(anchor, end) ?? walk(end, anchor);
}
