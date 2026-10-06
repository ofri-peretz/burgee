/**
 * How `dotenv run` starts its command — dotenv 18's `lib/spawn-command.js`, ported line for line.
 *
 * On POSIX it is `child_process.spawn` and nothing else. On Windows it is the part worth porting
 * exactly: a native executable is spawned directly so Node quotes its arguments, and anything
 * else goes through `cmd.exe` with every token escaped for the C runtime and then for cmd — once,
 * or twice for a batch file, whose `%*` reparses what it forwards. dotenv's suite pins this with
 * arguments built to break each layer (`a"quote`, `trailing\`, `a&b`, `%PATH%`, `^caret`).
 */
import cp, { type ChildProcess, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type { ChildProcess, SpawnOptions };

/** The C runtime's quoting: backslashes are literal except before a quote, where they pair. */
export function quoteWindowsArgument(value: string): string {
  const output = ['"'];
  let backslashes = 0;
  for (const character of value) {
    if (character === '\\') {
      backslashes++;
      continue;
    }
    if (character === '"') output.push('\\'.repeat(backslashes * 2 + 1), '"');
    else output.push('\\'.repeat(backslashes), character);
    backslashes = 0;
  }
  output.push('\\'.repeat(backslashes * 2), '"');
  return output.join('');
}

const isLetterOrDigit = (code: number): boolean => (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
const ASCII_END = 128;

/** Protect a token from cmd's parser, one layer of carets per pass; quotes survive for the program. */
export function protectShellToken(token: string, passes = 1): string {
  let out = token;
  for (let pass = 0; pass < passes; pass++) {
    const output: string[] = [];
    for (const character of out) {
      const code = character.codePointAt(0) as number;
      if (!isLetterOrDigit(code) && !'\\/:._-'.includes(character) && code < ASCII_END) output.push('^');
      output.push(character);
    }
    out = output.join('');
  }
  return out;
}

/** A Windows environment variable, which is case-insensitive there; the last spelling wins. */
export function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env)
    .reverse()
    .find((k) => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/** The file Windows would run for `command`: `PATHEXT` suffixes over the cwd, then `PATH`. */
export function resolveWindowsCommand(command: string, env: Record<string, string | undefined>, cwd: string): string | undefined {
  const extensions = (envValue(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const hasExtension = extensions.some((ext) => command.toLowerCase().endsWith(ext.toLowerCase()));
  const suffixes = hasExtension ? ['', ...extensions] : [...extensions, ''];
  const directories = /[\\/]/.test(command) ? [cwd] : [cwd, ...(envValue(env, 'PATH') ?? '').split(';')];
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const file = path.resolve(cwd, directory.replace(/^"|"$/g, ''), command + suffix);
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {
        // Not here; the next candidate.
      }
    }
  }
  return undefined;
}

export interface SpawnContext {
  platform: string;
  env: Record<string, string | undefined>;
  cwd: () => string;
}

/** Start `command` with `args`, as dotenv does on this platform. */
export function spawnCommand(command: string, args: readonly string[], options: SpawnOptions, context: SpawnContext): ChildProcess {
  if (context.platform !== 'win32') return cp.spawn(command, args, options);
  const env = options.env ?? context.env;
  const file = resolveWindowsCommand(command, env, typeof options.cwd === 'string' ? options.cwd : context.cwd());
  // A native executable gets its arguments quoted by Node, with no cmd.exe in between.
  if (file !== undefined && /\.(?:exe|com)$/i.test(file)) return cp.spawn(file, args, options);
  // Batch files and npm's shims reparse what `%*` forwards, so they get a second pass.
  const batchFile = /\.(?:bat|cmd)$/i.test(file ?? command);
  const tokens = [protectShellToken(path.normalize(file ?? command))];
  for (const argument of args) tokens.push(protectShellToken(quoteWindowsArgument(argument), batchFile ? 2 : 1));
  return cp.spawn(envValue(env, 'COMSPEC') || 'cmd.exe', ['/d', '/v:off', '/s', '/c', `"${tokens.join(' ')}"`], { ...options, windowsVerbatimArguments: true });
}

/** `child_process.spawnSync`, read off the module at the call so a test's spy reaches it. `dotenv run` uses it for `taskkill` on Windows. */
export function spawnSync(command: string, args: readonly string[], options: { stdio: 'ignore' }): unknown {
  return cp.spawnSync(command, args, options);
}

/**
 * The child's own end: its `error` and its `exit`. These are events of the **child**, not of this
 * process — nothing in this package hooks its own process's exit, which is closeout's job. They
 * live here with the rest of the child's mechanics so one file holds all of them.
 */
export function onChildEnd(child: ChildProcess, onError: (error: Error) => void, onExit: (code: number | null, signal: NodeJS.Signals | null) => void): void {
  child.on('error', onError);
  child.on('exit', onExit);
}
