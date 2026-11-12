import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export const columnDividerWidth = 5;

export function ResizableColumn({
  label,
  className,
  width,
  minWidth,
  minRemainingWidth,
  onResize,
  children,
}: {
  readonly label: string;
  readonly className: string;
  readonly width: number | null;
  readonly minWidth: number;
  readonly minRemainingWidth: number;
  readonly onResize: (width: number | null) => void;
  readonly children: ReactNode;
}) {
  const column = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startWidth: number;
  } | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [bounds, setBounds] = useState({ width: minWidth, max: minWidth });
  const maximum = () =>
    Math.max(
      minWidth,
      (column.current?.parentElement?.getBoundingClientRect().width ?? 0) -
        minRemainingWidth -
        columnDividerWidth,
    );
  const clamp = (value: number) => Math.round(Math.max(minWidth, Math.min(maximum(), value)));
  const draggedWidth = (x: number) =>
    clamp((drag.current?.startWidth ?? minWidth) + x - (drag.current?.startX ?? x));
  const finish = (value: number | null) => {
    if (!drag.current) return;
    drag.current = null;
    setDraft(null);
    if (value !== null) onResize(value);
  };
  useLayoutEffect(() => {
    const pane = column.current;
    const parent = pane?.parentElement;
    if (!pane || !parent) return;
    const measure = () => {
      const width = Math.round(pane.getBoundingClientRect().width);
      const max = Math.round(
        Math.max(
          minWidth,
          parent.getBoundingClientRect().width - minRemainingWidth - columnDividerWidth,
        ),
      );
      setBounds((previous) =>
        previous.width === width && previous.max === max ? previous : { width, max },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [minWidth, minRemainingWidth]);
  const size = draft ?? width;
  const style = {
    "--review-column-width": size === null ? undefined : `${size}px`,
    minWidth,
    maxWidth: `max(${minWidth}px, calc(100% - ${minRemainingWidth + columnDividerWidth}px))`,
  } as CSSProperties;
  return (
    <>
      <div
        ref={column}
        role="region"
        aria-label={label}
        className={`review-resizable-column ${className}`}
        style={style}
      >
        {children}
      </div>
      <div
        className="review-column-divider"
        style={{ flexBasis: columnDividerWidth }}
        role="separator"
        aria-label={`Resize ${label}`}
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={bounds.max}
        aria-valuenow={bounds.width}
        aria-valuetext={`${bounds.width} pixels`}
        tabIndex={0}
        title={`Drag to resize ${label}. Double-click to reset. Arrow keys adjust width.`}
        data-resizing={draft !== null || undefined}
        onDoubleClick={() => onResize(null)}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const startWidth = column.current?.getBoundingClientRect().width ?? minWidth;
          drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth };
          setDraft(startWidth);
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId === event.pointerId) setDraft(draggedWidth(event.clientX));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) finish(draggedWidth(event.clientX));
        }}
        onPointerCancel={(event) => {
          if (drag.current?.pointerId === event.pointerId) finish(null);
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointerId === event.pointerId)
            finish(clamp(column.current?.getBoundingClientRect().width ?? minWidth));
        }}
        onKeyDown={(event) => {
          if (drag.current) return;
          const current = column.current?.getBoundingClientRect().width ?? minWidth;
          const step = event.shiftKey ? 50 : 10;
          const next =
            event.key === "ArrowLeft"
              ? current - step
              : event.key === "ArrowRight"
                ? current + step
                : event.key === "Home"
                  ? minWidth
                  : event.key === "End"
                    ? maximum()
                    : null;
          if (next === null) return;
          event.preventDefault();
          onResize(clamp(next));
        }}
      />
    </>
  );
}
