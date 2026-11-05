import { lstat, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function ensureReviewDirectory(directory: string, uid = process.getuid?.()) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || (uid !== undefined && info.uid !== uid) || (info.mode & 0o077) !== 0)
    throw new Error(
      `Review socket directory must be owned by the current user with private permissions: ${directory}`,
    );
}

export function legacyReviewDirectory() {
  return join(tmpdir(), `paseo-jj-review-${process.getuid?.() ?? "user"}`);
}

export async function reviewDirectory() {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (runtime) {
    const canonical = await realpath(runtime);
    await ensureReviewDirectory(canonical);
    return join(canonical, "paseo-jj-review");
  }
  return legacyReviewDirectory();
}
