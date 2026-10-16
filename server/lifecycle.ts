import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  normalizeLifecycleCommands,
  PaseoConfigRawSchema,
} from "@getpaseo/protocol/paseo-config-schema";

export async function runWorktreeLifecycle(options: {
  phase: "setup" | "teardown";
  directory: string;
  name: string;
  sourceDirectory?: string;
  signal: AbortSignal;
}): Promise<void> {
  const { phase, directory, name, signal } = options;
  signal.throwIfAborted();
  let contents: string;
  try {
    contents = await readFile(join(directory, "paseo.json"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  const config = PaseoConfigRawSchema.parse(JSON.parse(contents));
  const commands = normalizeLifecycleCommands(config.worktree?.[phase]);
  if (commands.length === 0) return;

  let sourceDirectory = options.sourceDirectory;
  if (!sourceDirectory) {
    // Older ownership markers did not record the source checkout. The shared
    // jj repository normally lives at <source>/.jj/repo.
    const repoPath = join(directory, ".jj", "repo");
    const sharedRepo = await realpath(
      (await stat(repoPath)).isDirectory()
        ? repoPath
        : resolve(dirname(repoPath), (await readFile(repoPath, "utf8")).trim()),
    );
    sourceDirectory = dirname(dirname(sharedRepo));
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PASEO_SOURCE_CHECKOUT_PATH: sourceDirectory,
    PASEO_ROOT_PATH: sourceDirectory,
    PASEO_WORKTREE_PATH: directory,
    PASEO_BRANCH_NAME: name,
  };
  // Match Paseo's non-interactive script shell without sourcing BASH_ENV.
  delete env.BASH_ENV;
  for (const command of commands) {
    signal.throwIfAborted();
    console.info(`paseo-jj-workspace worktree.${phase} in ${directory}: ${command}`);
    const commandSignal = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
    const windows = process.platform === "win32";
    const child = spawn(
      windows ? "powershell" : "bash",
      windows ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command],
      {
        cwd: directory,
        env,
        signal: commandSignal,
        detached: !windows,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk: Buffer) => console.info(chunk.toString().trimEnd()));
    child.stderr.on("data", (chunk: Buffer) => console.error(chunk.toString().trimEnd()));
    const execution = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, terminationSignal) => {
        if (code === 0) resolve();
        else reject(new Error(`Command exited with ${terminationSignal ?? code}`));
      });
    });
    const stopChildren = () => {
      const pid = child.pid;
      if (!windows && pid !== undefined) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          // The shell and its process group may already have exited.
        }
      }
    };
    commandSignal.addEventListener("abort", stopChildren, { once: true });
    if (commandSignal.aborted) stopChildren();
    try {
      await execution;
    } catch (error) {
      stopChildren();
      signal.throwIfAborted();
      throw new Error(`worktree.${phase} failed in ${directory}: ${command}`, { cause: error });
    } finally {
      commandSignal.removeEventListener("abort", stopChildren);
    }
  }
  signal.throwIfAborted();
}
