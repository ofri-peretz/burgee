/**
 * `execa` for a vendored suite: the two calls chalk's tests make — `execaNode(file, args,
 * { env, extendEnv })` — over `node:child_process`. Returns what the tests read:
 * `stdout` and `stderr`, trimmed the way execa trims them.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExecaResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecaOptions {
  env?: Record<string, string | undefined>;
  /** execa's default is true: the child gets the parent's env plus `env`. False gives it `env` alone. */
  extendEnv?: boolean;
  cwd?: string;
}

export async function execaNode(file: string, args: readonly string[] = [], options: ExecaOptions = {}): Promise<ExecaResult> {
  const env = options.extendEnv === false ? (options.env ?? {}) : { ...process.env, ...(options.env ?? {}) };
  const { stdout, stderr } = await execFileAsync(process.execPath, [file, ...args], { env: env as NodeJS.ProcessEnv, ...(options.cwd === undefined ? {} : { cwd: options.cwd }) });
  return { stdout: String(stdout).replace(/\r?\n$/, ''), stderr: String(stderr).replace(/\r?\n$/, ''), exitCode: 0 };
}

export const execa = execaNode;
