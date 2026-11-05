import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Repository } from "../shared/repositories.js";

export async function findJjRoot(path: string): Promise<string | null> {
  let current = path;
  while (true) {
    try {
      if ((await stat(join(current, ".jj"))).isDirectory()) return current;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// Do not follow directory symlinks into repositories outside this checkout.
async function childRepository(root: string, name: string): Promise<string | null> {
  const child = join(root, name);
  try {
    return (await lstat(child)).isDirectory() && (await lstat(join(child, ".jj"))).isDirectory()
      ? child
      : null;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function listRepositories(cwd: string): Promise<ReadonlyArray<Repository>> {
  const root = await findJjRoot(await realpath(cwd));
  if (!root) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && entry.name !== ".jj" && entry.name !== ".git")
    .map((entry) => entry.name)
    .sort();
  const children = await Promise.all(
    names.map(async (name) =>
      (await childRepository(root, name)) ? { id: name, label: name } : null,
    ),
  );
  return [{ id: ".", label: basename(root) }, ...children.filter((entry) => entry !== null)];
}

export async function resolveRepository(cwd: string, repository = "."): Promise<string | null> {
  const root = await findJjRoot(await realpath(cwd));
  if (repository === ".") return root;
  if (
    !root ||
    !repository ||
    repository === ".." ||
    /[\\/\0]/.test(repository) ||
    repository === ".jj" ||
    repository === ".git"
  )
    throw new Error("Repository is unavailable. Refresh and choose a repository again.");
  const child = await childRepository(root, repository);
  if (!child) throw new Error("Repository is unavailable. Refresh and choose a repository again.");
  return child;
}
