import { useEffect, useId, useRef } from "react";
import type { ReviewSnapshot, ReviewTarget } from "../shared/review.js";
import { ReviewComparisonForm } from "./review-comparison-form.js";

export function ReviewComparisonDialog({
  target,
  snapshot,
  busy,
  onOpen,
  onClose,
}: {
  readonly target: ReviewTarget;
  readonly snapshot: ReviewSnapshot | undefined;
  readonly busy: boolean;
  readonly onOpen: (target: ReviewTarget) => void;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = dialog?.ownerDocument.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="review-comparison-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="review-dialog-content">
        <h2 id={titleId}>Select Changes</h2>
        <ReviewComparisonForm target={target} busy={busy} onOpen={onOpen} onCancel={onClose} />
        {snapshot ? (
          <details className="review-pinned">
            <summary>Current pinned revisions</summary>
            <code data-pmono="">
              {snapshot.comparison.kind === "endpoints"
                ? `${snapshot.comparison.from} → ${snapshot.comparison.to}`
                : snapshot.comparison.revisions.join(" | ")}
            </code>
          </details>
        ) : null}
      </div>
    </dialog>
  );
}
