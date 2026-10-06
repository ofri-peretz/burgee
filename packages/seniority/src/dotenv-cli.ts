/**
 * `seniority/dotenv/cli` — dotenv 18's `dotenv run`, ported from its `cli.js` (18.0.5).
 *
 * `run(argv)` takes the arguments after the program name, exactly as dotenv's own `run` does:
 * `['run', '-f', '.env.local', '--', 'node', 'server.js']`. It loads the files, prints dotenv's
 * `◇ injected env (n) from …` line unless quiet, starts the command with the environment it
 * built, forwards SIGINT, SIGTERM, SIGHUP and SIGQUIT to it (a second Ctrl-C escalates to
 * SIGTERM, a third to SIGKILL), and leaves with the command's exit code or its signal.
 *
 * It is the one drop-in in this package that is a program, so it takes the process as an
 * argument and gets the default from `runtime.ts` (D-135) — it never names the global.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { optionsFromEnv } from './dotenv-options.js';
import { type ChildProcess, onChildEnd, spawnCommand, type SpawnOptions, spawnSync as spawnSyncDefault } from './dotenv-spawn.js';
import dotenv from './dotenv.js';
import { ambientProcess, type CliProcess } from './runtime.js';

/** dotenv's help text, to the line. */
export const HELP = [
  'Usage: dotenv run [--help] [-q|--quiet] [--debug] [--override] [--fast] [-f|--file <paths>] [--] <command> [args...]',
  '',
  'Run a command with environment variables from a .env file.',
  'Place dotenv options before the command; all following arguments go to the command.',
  '',
  'Options:',
  '  -f, --file <paths>  .env paths, comma-separated or repeated (default: .env)',
  '  -q, --quiet suppress the injected env message',
  '  --debug     enable debug logging',
  '  --override  override existing environment variables',
  '  --fast      use the faster character-scanner parser',
  '',
  'Environment variables (DOTENV_CONFIG_* names remain as fallbacks):',
  '  DOTENV_PATH, DOTENV_ENCODING, DOTENV_QUIET,',
  '  DOTENV_DEBUG, DOTENV_OVERRIDE,',
  '  DOTENV_FAST',
].join('\n');

/** The command line, read: dotenv's flags up to the command, and the command with everything after it. */
export type RunArgs =
  | { help: true }
  | { error: string }
  | { paths: string[]; pathSet: boolean; quiet?: boolean; debug?: boolean; override?: boolean; fast?: boolean; command: string[] };

const FLAGS: Record<string, 'quiet' | 'debug' | 'override' | 'fast'> = { '--quiet': 'quiet', '-q': 'quiet', '--debug': 'debug', '--override': 'override', '--fast': 'fast' };

/** One `-f`/`--file` occurrence: its paths, or the error dotenv gives for none. */
function fileFlag(arg: string, next: () => string | undefined): string[] | { error: string } {
  const equalsIndex = arg.indexOf('=');
  const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
  const value = equalsIndex === -1 ? next() : arg.slice(equalsIndex + 1);
  if (!value || value === '--') return { error: `${flag} requires a path` };
  const filepaths = value
    .split(',')
    .map((filepath) => filepath.trim())
    .filter(Boolean);
  return filepaths.length === 0 ? { error: `${flag} requires a path` } : filepaths;
}

/** dotenv's `parseRunArgs`. */
export function parseRunArgs(args: readonly string[]): RunArgs {
  const paths: string[] = [];
  let pathSet = false;
  const set: { quiet?: boolean; debug?: boolean; override?: boolean; fast?: boolean } = {};
  let commandIndex = -1;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--') {
      commandIndex = i + 1;
      break;
    }
    if (arg === '--help' || arg === '-h') return { help: true };
    const flag = FLAGS[arg];
    if (flag !== undefined) {
      set[flag] = true;
      continue;
    }
    if (arg === '-f' || arg === '--file' || arg.startsWith('-f=') || arg.startsWith('--file=')) {
      const found = fileFlag(arg, () => args[++i]);
      if ('error' in found) return found;
      paths.push(...found);
      pathSet = true;
      continue;
    }
    if (arg.startsWith('-')) return { error: `unknown option: ${arg}` };
    commandIndex = i;
    break;
  }
  return { paths, pathSet, ...set, command: commandIndex === -1 ? [] : args.slice(commandIndex) };
}

interface RunOptions {
  encoding: BufferEncoding;
  quiet: boolean;
  debug: boolean;
  override: boolean;
  fast: boolean;
  paths: string[];
  defaultPath: boolean;
}

/** dotenv's `resolveRunOptions`: the environment's `DOTENV_*` defaults, then the flags over them. */
function resolveRunOptions(parsed: Extract<RunArgs, { command: string[] }>, env: Record<string, string | undefined>): RunOptions {
  const envOptions = optionsFromEnv(env);
  const options: RunOptions = {
    encoding: (envOptions.encoding ? envOptions.encoding : 'utf8') as BufferEncoding,
    quiet: envOptions.quiet === true,
    debug: envOptions.debug === true,
    override: envOptions.override === true,
    fast: envOptions.fast === true,
    paths: ['.env'],
    defaultPath: true,
  };
  if (envOptions.path !== undefined) {
    options.paths = [envOptions.path];
    options.defaultPath = false;
  }
  if (parsed.pathSet) {
    options.paths = parsed.paths;
    options.defaultPath = false;
  }
  for (const key of ['quiet', 'debug', 'override', 'fast'] as const) {
    const flag = parsed[key];
    if (flag !== undefined) options[key] = flag;
  }
  return options;
}

const resolveHome = (envPath: string): string => (envPath.startsWith('~') ? path.join(os.homedir(), envPath.slice(1)) : envPath);

/**
 * dotenv's `loadEnvFiles`. A missing default `.env` is fine; any other failure — a named file
 * that is not there, one that cannot be read — stops the run before the command starts.
 */
function loadEnvFiles(options: RunOptions, proc: CliProcess): { injected: Record<string, string>; loadedPaths: string[] } {
  const parsedAll: Record<string, string> = {};
  const loadedPaths: string[] = [];
  const populateOptions = { override: options.override, debug: options.debug };
  for (const filepath of options.paths) {
    try {
      const parsed = dotenv.parse(fs.readFileSync(path.resolve(proc.cwd(), resolveHome(filepath)), { encoding: options.encoding }), { fast: options.fast });
      dotenv.populate(parsedAll, parsed, populateOptions);
      loadedPaths.push(filepath);
    } catch (cause) {
      const error = cause as NodeJS.ErrnoException;
       
      if (options.debug) console.log(`┆ failed to load ${filepath} ${error.message}`);
      if (!(options.defaultPath && error.code === 'ENOENT')) throw error;
    }
  }
  return { injected: dotenv.populate(proc.env, parsedAll, populateOptions), loadedPaths };
}

/** How the child is started, and how Windows takes its tree down; the real ones unless a test hands in its own. */
export interface RunIo {
  spawn?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  spawnSync?: (command: string, args: readonly string[], options: { stdio: 'ignore' }) => unknown;
}

/** The signals `dotenv run` forwards. */
const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const;
const SECOND_INTERRUPT = 2;
/** Keeps the event loop alive while a re-raised signal is delivered, so Node cannot exit 0 first. */
const KEEP_ALIVE_MS = 1000;

/** Send `signal` to the child (and its group, when it has one); a child already gone is not an error. */
function forwarder(child: ChildProcess, proc: CliProcess, useProcessGroup: boolean, spawnSync: () => void): (signal: string) => void {
  return (signal) => {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
    if (proc.platform === 'win32') {
      spawnSync();
      return;
    }
    try {
      proc.kill(useProcessGroup ? -child.pid : child.pid, signal);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ESRCH') throw cause;
    }
  };
}

/** dotenv's `run`: the whole of `dotenv <argv>`. */
export function run(argv: readonly string[], proc: CliProcess = ambientProcess() as CliProcess, io: RunIo = {}): void {
   
  const command = argv[0];
  if (command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }
  const parsed = command === 'run' ? parseRunArgs(argv.slice(1)) : undefined;
  if (parsed !== undefined && 'help' in parsed) {
    console.log(HELP);
    return;
  }
  if (parsed !== undefined && 'error' in parsed) console.error(`dotenv: ${parsed.error}`);
  if (parsed === undefined || 'error' in parsed || parsed.command.length === 0) {
    console.log(HELP);
    proc.exitCode = 1;
    return;
  }
   

  const options = resolveRunOptions(parsed, proc.env);
  try {
    const result = loadEnvFiles(options, proc);
    if (!options.quiet) {
      const from = result.loadedPaths.length > 0 ? ` from ${result.loadedPaths.join(', ')}` : '';
      console.error(`◇ injected env (${String(Object.keys(result.injected).length)})${from}`);
    }
  } catch (cause) {
    console.error(`dotenv: ${(cause as Error).message}`);
    proc.exitCode = 1;
    return;
  }

  const interactive = Boolean(proc.stdin.isTTY);
  // A separate group lets services and CI stop descendants too. Interactive children stay in
  // the terminal's foreground group, so stdin and Ctrl-C work normally.
  const useProcessGroup = proc.platform !== 'win32' && !interactive;
  const start = io.spawn ?? ((file: string, args: readonly string[], opts: SpawnOptions) => spawnCommand(file, args, opts, proc));
  const spawnSync = io.spawnSync ?? spawnSyncDefault;
  const [file, ...args] = parsed.command as [string, ...string[]];
  const child = start(file, args, { stdio: 'inherit', detached: useProcessGroup });
  // Windows has no POSIX process-group signals: the shell's whole tree is taken down instead.
  const forward = forwarder(child, proc, useProcessGroup, () => spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }));

  const handlers = new Map<string, () => void>();
  let interrupts = 0;
  const cleanup = (): void => {
    for (const [signal, handler] of handlers) proc.removeListener(signal, handler);
  };
  for (const signal of FORWARDED) {
    const handler = (): void => {
      if (signal === 'SIGINT') {
        interrupts++;
        // The terminal already delivers Ctrl-C to the foreground child. Further interrupts
        // escalate rather than duplicate its graceful shutdown.
        if (interactive && proc.platform !== 'win32' && interrupts === 1) return;
        if (interrupts > 1) {
          forward(interrupts === SECOND_INTERRUPT ? 'SIGTERM' : 'SIGKILL');
          return;
        }
      }
      forward(signal);
    };
    handlers.set(signal, handler);
    proc.on(signal, handler);
  }

  onChildEnd(
    child,
    (error) => {
      cleanup();
      console.error(`dotenv: ${error.message}`);
      proc.exitCode = 1;
    },
    (exitCode, signal) => {
      cleanup();
      if (typeof exitCode === 'number') {
        proc.exit(exitCode);
        return;
      }
      // Keep the loop alive until the re-raised signal ends this process; otherwise Node can
      // finish normally before it is delivered and report exit 0.
      setInterval(() => undefined, KEEP_ALIVE_MS);
      proc.kill(proc.pid, signal as string);
    },
  );
}
