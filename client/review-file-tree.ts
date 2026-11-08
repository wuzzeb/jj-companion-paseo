import type { ReviewFile } from "../shared/review.js";

export type FileNode =
  | {
      readonly kind: "directory";
      readonly name: string;
      readonly path: string;
      readonly children: ReadonlyArray<FileNode>;
    }
  | {
      readonly kind: "file";
      readonly name: string;
      readonly path: string;
      readonly file: ReviewFile;
    };

export function buildFileTree(files: ReadonlyArray<ReviewFile>): ReadonlyArray<FileNode> {
  return directory(files, 0, "");
}

function directory(
  files: ReadonlyArray<ReviewFile>,
  depth: number,
  prefix: string,
): ReadonlyArray<FileNode> {
  const folders = new Map<string, ReviewFile[]>();
  const nodes: FileNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    const name = parts[depth];
    if (parts.length === depth + 1) nodes.push({ kind: "file", name, path: file.path, file });
    else {
      const group = folders.get(name);
      if (group) group.push(file);
      else folders.set(name, [file]);
    }
  }
  for (const [name, group] of folders) {
    const path = `${prefix}${name}`;
    nodes.push({
      kind: "directory",
      name,
      path,
      children: directory(group, depth + 1, `${path}/`),
    });
  }
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
