import { spawn } from "node:child_process";
export async function runJj(
  cwd: string,
  args: string[],
  options: { readOnly?: boolean; operation?: string; signal?: AbortSignal; network?: boolean } = {},
): Promise<string> {
  const { readOnly = true, operation = "@", signal, network = false } = options;
  const timeout = network ? 180_000 : 20_000;
  if (signal?.aborted) throw new Error("Operation cancelled.");
  const child = spawn(
    "jj",
    [
      "--no-pager",
      "--color=never",
      "--config=ui.interactive=false",
      ...(readOnly ? ["--ignore-working-copy", `--at-operation=${operation}`] : []),
      ...args,
    ],
    {
      cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    },
  );
  return new Promise<string>((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let stopped: string | null = null;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    let forceExit: Promise<void> | undefined;
    let spawnError: Error | undefined;
    const kill = (termination: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && child.pid !== undefined)
          process.kill(-child.pid, termination);
        else child.kill(termination);
      } catch {
        /* The process group already exited. */
      }
    };
    const stop = (message: string) => {
      if (stopped) return;
      stopped = message;
      // jj can launch Git or SSH; stop its process group before admitting the next operation.
      kill("SIGTERM");
      forceExit = new Promise<void>((done) => {
        forceTimer = setTimeout(() => {
          kill("SIGKILL");
          done();
        }, 1000);
      });
    };
    const onAbort = () => stop("Operation cancelled.");
    const timer = setTimeout(() => stop(`jj timed out after ${timeout / 1000} seconds.`), timeout);
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      signal?.removeEventListener("abort", onAbort);
    };
    const capture = (chunks: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) stop("jj output exceeded the 16 MiB limit.");
      else chunks.push(chunk);
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));
    child.once("error", (error) => {
      spawnError = new Error(
        "code" in error && error.code === "ENOENT"
          ? "jj was not found on the daemon’s PATH."
          : error.message,
      );
    });
    child.once("close", async (code) => {
      if (forceExit) await forceExit;
      cleanup();
      if (stopped) reject(new Error(stopped));
      else if (spawnError) reject(spawnError);
      else if (code !== 0)
        reject(new Error(Buffer.concat(stderr).toString().trim().slice(0, 2000) || "jj failed."));
      else resolve(Buffer.concat(stdout).toString());
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export function jsonLines(text: string): unknown[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}
