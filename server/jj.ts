import { runSubprocess } from "./subprocess.js";
export async function runJj(
  cwd: string,
  args: ReadonlyArray<string>,
  options: {
    readonly readOnly?: boolean;
    readonly operation?: string;
    readonly signal?: AbortSignal;
    readonly network?: boolean;
  } = {},
): Promise<string> {
  const { readOnly = true, operation = "@", signal, network = false } = options;
  return runSubprocess(
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
      timeoutMs: network ? 180_000 : 20_000,
      signal,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    },
  );
}

export function jsonLines(text: string): unknown[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}
