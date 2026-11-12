import { execFile, spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

interface SubprocessOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
  readonly maxOutputBytes?: number;
  readonly onStdout?: (text: string) => void;
  readonly onStderr?: (text: string) => void;
}

export async function stopProcessTree(child: ChildProcess): Promise<void> {
  if (process.platform === "win32") {
    // Kill the tree before killing its root: taskkill needs the parent's process ID.
    if (child.pid !== undefined)
      await new Promise<void>((resolve) => {
        execFile(
          "taskkill",
          ["/PID", String(child.pid), "/T", "/F"],
          { timeout: 5_000, windowsHide: true },
          () => {
            child.kill("SIGKILL");
            resolve();
          },
        );
      });
    return;
  }
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (child.pid === undefined) return false;
      process.kill(-child.pid, signal);
      return true;
    } catch {
      // The process group already exited.
      return false;
    }
  };
  if (!kill("SIGTERM")) return;
  // A shell may exit before its descendants, including children that ignore SIGTERM.
  await delay(1_000);
  kill("SIGKILL");
}

/** Await process-tree cleanup on failure or cancellation before settling. */
export async function runSubprocess(
  command: string,
  args: ReadonlyArray<string>,
  options: SubprocessOptions,
): Promise<string> {
  const { signal, timeoutMs, maxOutputBytes = 16 * 1024 * 1024 } = options;
  if (signal?.aborted) throw new Error("Operation cancelled.");
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise<string>((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let stopped: string | null = null;
    let stopping: Promise<void> | undefined;
    let spawnError: Error | undefined;
    const stop = (message: string) => {
      if (stopped) return;
      stopped = message;
      stopping ??= stopProcessTree(child);
    };
    const onAbort = () => stop("Operation cancelled.");
    const timer = setTimeout(
      () => stop(`${command} timed out after ${timeoutMs / 1000} seconds.`),
      timeoutMs,
    );
    const capture = (chunks: Buffer[], onOutput?: (text: string) => void) => (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxOutputBytes)
        stop(`${command} output exceeded the ${maxOutputBytes / (1024 * 1024)} MiB limit.`);
      else {
        chunks.push(chunk);
        onOutput?.(chunk.toString());
      }
    };
    child.stdout.on("data", capture(stdout, options.onStdout));
    child.stderr.on("data", capture(stderr, options.onStderr));
    child.once("error", (error) => {
      spawnError = new Error(
        "code" in error && error.code === "ENOENT"
          ? `${command} was not found on the daemon’s PATH.`
          : error.message,
      );
    });
    child.once("exit", (code) => {
      if (code === 0) return;
      // Descendants may retain our pipes, delaying close, or redirect them and
      // outlive close entirely. Start cleanup as soon as the parent fails.
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      stopping ??= stopProcessTree(child);
    });
    child.once("close", async (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (stopping) await stopping;
      if (stopped) reject(new Error(stopped));
      else if (spawnError) reject(spawnError);
      else if (code !== 0)
        reject(
          Object.assign(
            new Error(
              Buffer.concat(stderr).toString().trim().slice(0, 2000) ||
                `Command failed: ${command} (exit ${code}).`,
            ),
            { code },
          ),
        );
      else resolve(Buffer.concat(stdout).toString());
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
