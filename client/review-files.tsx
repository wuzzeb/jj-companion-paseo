import { useMemo } from "react";
import type { ReviewFile } from "../shared/review.js";
import { buildFileTree, type FileNode } from "./review-file-tree.js";

interface FileSelection {
  readonly selectedPath: string | null;
  readonly onSelect: (path: string) => void;
}

export function ReviewFiles({
  files,
  layout,
  onToggleLayout,
  ...selection
}: FileSelection & {
  readonly files: ReadonlyArray<ReviewFile>;
  readonly layout: "flat" | "tree";
  readonly onToggleLayout: () => void;
}) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  return (
    <nav className="review-files" aria-label="Changed files">
      <div className="review-files-header">
        <span className="review-file-count">
          {files.length} changed {files.length === 1 ? "file" : "files"}
        </span>
        <button
          onClick={onToggleLayout}
          aria-label={layout === "flat" ? "Show file tree" : "Show flat file list"}
          title={layout === "flat" ? "Show file tree" : "Show flat file list"}
        >
          {layout === "flat" ? "Tree" : "Flat"}
        </button>
      </div>
      {layout === "tree" ? (
        <FileNodes nodes={tree} {...selection} />
      ) : (
        files.map((file) => (
          <FileButton key={file.path} file={file} name={file.path} {...selection} />
        ))
      )}
    </nav>
  );
}

function FileNodes({
  nodes,
  ...selection
}: FileSelection & { readonly nodes: ReadonlyArray<FileNode> }) {
  return nodes.map((node) =>
    node.kind === "directory" ? (
      <details className="review-directory" key={`directory:${node.path}`} open>
        <summary title={node.path}>{node.name}</summary>
        <div className="review-tree-children">
          <FileNodes nodes={node.children} {...selection} />
        </div>
      </details>
    ) : (
      <FileButton key={`file:${node.path}`} file={node.file} name={node.name} {...selection} />
    ),
  );
}

function FileButton({
  file,
  name,
  selectedPath,
  onSelect,
}: FileSelection & {
  readonly file: ReviewFile;
  readonly name: string;
}) {
  return (
    <button
      className="review-file"
      data-status={file.status}
      aria-pressed={file.path === selectedPath}
      aria-label={file.path}
      title={file.oldPath === file.path ? file.path : `${file.oldPath} → ${file.path}`}
      onClick={() => onSelect(file.path)}
    >
      <span className="review-status" aria-hidden="true">
        {file.status}
      </span>
      <span>{name}</span>
    </button>
  );
}
