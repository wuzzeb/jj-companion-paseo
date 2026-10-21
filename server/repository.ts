import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";

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
