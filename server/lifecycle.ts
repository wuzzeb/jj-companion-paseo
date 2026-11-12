import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  normalizeLifecycleCommands,
  PaseoConfigRawSchema,
} from "@getpaseo/protocol/paseo-config-schema";
import { runSubprocess } from "./subprocess.js";
import { sharedRepositoryPath } from "./repository.js";

export async function runWorktreeLifecycle(options: {
  readonly phase: "setup" | "teardown";
  readonly directory: string;
  readonly name: string;
  readonly sourceDirectory?: string;
  readonly signal: AbortSignal;
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
    const sharedRepo = await sharedRepositoryPath(directory);
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
    console.info(`paseo-jj-companion worktree.${phase} in ${directory}: ${command}`);
    const windows = process.platform === "win32";
    try {
      await runSubprocess(
        windows ? "powershell" : "bash",
        windows ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command],
        {
          cwd: directory,
          env,
          signal,
          timeoutMs: 25_000,
          onStdout: (text) => console.info(text.trimEnd()),
          onStderr: (text) => console.error(text.trimEnd()),
        },
      );
    } catch (error) {
      signal.throwIfAborted();
      throw new Error(`worktree.${phase} failed in ${directory}: ${command}`, { cause: error });
    }
  }
  signal.throwIfAborted();
}
