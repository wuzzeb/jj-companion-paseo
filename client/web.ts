import { Platform } from "react-native";
import type { Bookmark } from "../shared/bookmarks.js";

interface Transfer {
  types: readonly string[];
  effectAllowed: string;
  dropEffect: string;
  setData(type: string, value: string): void;
  getData(type: string): string;
}
interface DragEvent {
  dataTransfer?: Transfer;
  preventDefault(): void;
  stopPropagation(): void;
}
interface Element {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event: DragEvent) => void): void;
  removeEventListener(type: string, listener: (event: DragEvent) => void): void;
}
const mime = "application/x-paseo-jj-bookmark";
export interface BookmarkDrag {
  hostId: string;
  workspaceId: string;
  bookmark: Bookmark;
}

interface MenuEvent {
  target: unknown;
  key?: string;
  preventDefault(): void;
  stopPropagation(): void;
}
interface MenuElement {
  contains(node: unknown): boolean;
  focus(): void;
  querySelectorAll(selector: string): ArrayLike<MenuElement>;
  ownerDocument: {
    addEventListener(type: string, listener: (event: MenuEvent) => void, capture?: boolean): void;
    removeEventListener(
      type: string,
      listener: (event: MenuEvent) => void,
      capture?: boolean,
    ): void;
    activeElement: unknown;
    defaultView: {
      addEventListener(type: string, listener: () => void): void;
      removeEventListener(type: string, listener: () => void): void;
    } | null;
  };
}

export function bindBookmarkMenu(node: unknown, trigger: unknown, close: () => void) {
  if (Platform.OS !== "web" || !node) return () => {};
  const menu = node as MenuElement;
  const anchor = trigger as MenuElement;
  const document = menu.ownerDocument;
  const items = () =>
    Array.from(menu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])'));
  (items()[0] ?? menu).focus();
  const outside = (event: MenuEvent) => {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) close();
  };
  const scroll = (event: MenuEvent) => {
    if (!menu.contains(event.target)) close();
  };
  const keydown = (event: MenuEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      anchor.focus();
    } else if (event.key === "Tab") close();
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key ?? "")) {
      event.preventDefault();
      const entries = items();
      const index = entries.findIndex((entry) => entry === document.activeElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? entries.length - 1
            : (index + (event.key === "ArrowUp" ? -1 : 1) + entries.length) % entries.length;
      entries[next]?.focus();
    }
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("wheel", outside, true);
  document.addEventListener("keydown", keydown, true);
  document.addEventListener("scroll", scroll, true);
  document.defaultView?.addEventListener("resize", close);
  return () => {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("wheel", outside, true);
    document.removeEventListener("keydown", keydown, true);
    document.removeEventListener("scroll", scroll, true);
    document.defaultView?.removeEventListener("resize", close);
  };
}

function bind(node: unknown, listeners: Record<string, (event: DragEvent) => void>) {
  if (Platform.OS !== "web" || !node || typeof (node as Element).addEventListener !== "function")
    return () => {};
  const element = node as Element;
  for (const [type, handler] of Object.entries(listeners)) element.addEventListener(type, handler);
  return () => {
    for (const [type, handler] of Object.entries(listeners))
      element.removeEventListener(type, handler);
  };
}

export function bindBookmark(
  node: unknown,
  drag: BookmarkDrag | null,
  open: () => void,
  onDrag?: (dragging: boolean) => void,
) {
  if (Platform.OS !== "web") return () => {};
  const element = node as Element | null;
  if (drag) element?.setAttribute("draggable", "true");
  const cleanup = bind(node, {
    contextmenu: (event) => {
      event.preventDefault();
      event.stopPropagation();
      open();
    },
    dragstart: (event) => {
      if (!drag || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      onDrag?.(true);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(mime, JSON.stringify(drag));
    },
    dragend: () => onDrag?.(false),
  });
  return () => {
    cleanup();
    onDrag?.(false);
    if (drag) element?.removeAttribute("draggable");
  };
}

export function bindBookmarkDrop(
  node: unknown,
  accept: (drag: BookmarkDrag) => void,
  hover: (value: boolean) => void,
) {
  return bind(node, {
    dragover: (event) => {
      if (!event.dataTransfer?.types.includes(mime)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      hover(true);
    },
    dragleave: () => hover(false),
    drop: (event) => {
      hover(false);
      const data = event.dataTransfer?.getData(mime);
      if (!data) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        accept(JSON.parse(data));
      } catch {
        /* Ignore unrelated or malformed drag data. */
      }
    },
  });
}
