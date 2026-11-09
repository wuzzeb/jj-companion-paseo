import type { Bookmark } from "../shared/bookmarks.js";

export function BookmarkChip({ bookmark }: { readonly bookmark: Bookmark }) {
  const label = `${bookmark.name}${bookmark.remote ? `@${bookmark.remote}` : ""}${bookmark.conflict ? "??" : ""}`;
  return (
    <span
      className="review-bookmark-chip"
      data-testid={`jj-bookmark-${label}`}
      data-conflict={bookmark.conflict || undefined}
      title={label}
    >
      {label}
    </span>
  );
}
