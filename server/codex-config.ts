import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";

const configResponse = z.object({
  config: z.object({
    sandbox_workspace_write: z
      .object({ writable_roots: z.array(z.string()).default([]) })
      .nullish(),
  }),
});

interface ReadRootsOptions {
  cwd: string;
  signal: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

// Let Codex resolve user/project config, trust, relative paths, and home expansion.
// No thread or model request is created by this short-lived app-server.
export async function readCodexWritableRoots({ cwd, signal, env }: ReadRootsOptions) {
  signal.throwIfAborted();
  const child = spawn("codex", ["app-server"], {
    cwd,
    env,
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    killSignal: "SIGKILL",
    stdio: ["pipe", "pipe", "ignore"],
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const lines = createInterface({ input: child.stdout });
  try {
    return await new Promise<string[]>((resolve, reject) => {
      let received = 0;
      const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
      child.once("error", reject);
      child.stdin.on("error", reject);
      child.once("close", (code) =>
        reject(new Error(`Codex exited before config/read completed (${code})`)),
      );
      lines.on("line", (line) => {
        try {
          received += line.length;
          if (received > 1024 * 1024) throw new Error("Codex config response exceeds 1 MiB");
          const message = JSON.parse(line);
          if (message.id !== 1 && message.id !== 2) return;
          if (message.error) throw new Error(`Codex config/read: ${message.error.message}`);
          if (message.id === 1) {
            send({ method: "initialized" });
            send({ id: 2, method: "config/read", params: { cwd, includeLayers: false } });
          } else {
            const { config } = configResponse.parse(message.result);
            resolve(config.sandbox_workspace_write?.writable_roots ?? []);
          }
        } catch (error) {
          reject(error);
        }
      });
      send({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "paseo-jj-workspace", version: "0.1.0" },
          capabilities: { experimentalApi: true },
        },
      });
    });
  } finally {
    lines.close();
    child.kill("SIGKILL");
    await closed;
  }
}
