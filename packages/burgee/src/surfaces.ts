/**
 * Everything the engine answers without running a command — help, `--version`, `help
 * [command…]`, `completion <shell>`, `__complete`, `config explain`, `--schema` and `--mcp` —
 * kept off the startup path (U5).
 *
 * `execute.ts` imports this module only when argv asks for one of them, or when argv resolves
 * no runnable command. A run that dispatches a handler, which is every run a program exists
 * for, never loads a byte of it. Each surface was already asynchronous, and each already loaded
 * its own body (`help.js`, `schema.js`, `completions.js`, `mcp.js` …) behind an `await
 * import()`; what moved here is the routing and the glue that used to sit in the entry chunk.
 */
import { ConfigError, type Resolution } from 'seniority/precedence';

import { detectAgent } from './agent.js';
import { beforeTerminator, isJsonFlag } from './argv.js';
import { UsageError } from './errors.js';
import { ExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { type CommandNode, type Manifest, type OptionSpec } from './manifest.js';
import { type Package } from './pkg.js';

/** The slice of the engine's `Io` a surface reads. */
export interface SurfaceIo {
  out: { write: (s: string) => unknown };
  env: Record<string, string | undefined>;
  width: number;
  stdin: NodeJS.ReadableStream;
  /** The package.json owning the entry file, read once (V4). */
  pkg: Package | undefined;
  tty: boolean;
}

/** What a surface needs back from the engine: precedence for `config explain`, a run for `--mcp`. */
export interface Engine {
  resolution: (specs: Record<string, OptionSpec>, flags: Record<string, unknown>) => Promise<Resolution>;
  execute: (
    manifest: Manifest,
    opts: { argv: string[]; env: Record<string, string | undefined>; stdout: { write: (s: string) => unknown }; stderr: { write: (s: string) => unknown }; exit: (code: number) => void },
  ) => Promise<void>;
}

const HELP_FLAGS = new Set(['--help', '-h']);

/** What to do when argv resolves to no runnable command: help, or a usage error naming it. */
interface Resolving {
  manifest: Manifest;
  root: string[];
  io: SurfaceIo;
}

/**
 * F2 — help as data: one command, its options and arguments, and the names of its children.
 *
 * The same `CommandSchema` shape `--schema` publishes, scoped to the node the reader asked
 * about, so there is one document shape in the package rather than a second one invented for
 * help. Children are names only: `--help` on a group is a menu, and a reader who wants a
 * child's detail asks for that child.
 */
async function helpDocumentOf(manifest: Manifest, node: CommandNode): Promise<Record<string, unknown>> {
  const { commandSchemaOf, typedName } = await import('./schema.js');
  const root = manifest.rootPath;
  const children = manifest.commands
    .filter((c) => c.path.length === node.path.length + 1 && c.path.slice(0, node.path.length).join(' ') === node.path.join(' '))
    .map((c) => typedName(c, root));
  return {
    schemaVersion: 1,
    ...commandSchemaOf(node, root),
    ...(children.length === 0 ? {} : { commands: children }),
  };
}

/** The node help is rendered for when nothing more specific resolves: the root's own. */
function rootNode(manifest: Manifest, root: string[]): CommandNode {
  return manifest.find(root) ?? { path: root, options: {} };
}

/**
 * Loaded where it is printed, not at the top of the file.
 *
 * `help.js` is 4.1 KB and it reaches `linegauge` for column measurement, another 6.1 KB —
 * together a third of the core entry, on a path a program takes when someone asks for help
 * and never otherwise. Reached through `await import()`, a bundler with code splitting
 * leaves all of it off the startup path.
 */
const renderHelp = async (manifest: Manifest, node: CommandNode, io: SurfaceIo): Promise<string> => {
  const help = await import('./help.js');
  return help.renderHelp(manifest, node, { width: io.width, color: help.colorFor(io.env, detectAgent(io.env, io.tty).interactive) });
};

/**
 * `schema.ts` on demand, for the same reason help is: nothing in it runs unless a reader asks
 * for a document.
 *
 * Every call site — `--help --json`, `--schema`, and the `help` command — is a branch a normal
 * run never takes, and the module is 2,640 bundled bytes plus the `plugin.ts` and `manifest.ts`
 * it drags into the same chunk. It was static because `schemaSurface` and `helpDocumentOf` were
 * synchronous; both are only ever called from `async` functions, so making them `async` costs a
 * microtask on a path that is about to write to stdout and print nothing else.
 */
const machineJson = async (...args: Parameters<(typeof import('./schema.js'))['machineJson']>): Promise<string> =>
  (await import('./schema.js')).machineJson(...args);

/**
 * `--help` on a command that resolved: prose, or — with `--json` beside it — the help document
 * (F2). It printed the same prose as `--help` with both flags, so a caller who asked for a
 * machine-readable answer got one they had to parse: the exact failure the `--json` surface
 * exists to avoid, on the flag people type first.
 */
export async function helpFor(manifest: Manifest, node: CommandNode, io: SurfaceIo, json: boolean): Promise<string> {
  if (json) return `${await machineJson(await helpDocumentOf(manifest, node), ['--json'])}\n`;
  return await renderHelp(manifest, node, io);
}

/** `--version`: the declared version, else the owning package.json's (V4). */
export function versionOf(manifest: Manifest, io: Pick<SurfaceIo, 'pkg'>): string {
  const declared = manifest.version ?? (typeof io.pkg?.data['version'] === 'string' ? io.pkg.data['version'] : undefined);
  if (declared === undefined) throw new ConfigError('no version declared', 'pass version to defineProgram, or set "version" in the owning package.json');
  return declared;
}

/**
 * What to do when argv resolves to no runnable command: help, the version, or a usage error
 * naming it.
 *
 * `--version` is the same courtesy `--help` gets, for the flag people type first. A program
 * that is a pure command group resolves nothing for `burgee --version`, so it fell through
 * to `unknown command "--version"` and **exit 2** — which under E1 means *rewrite the
 * command*, so an agent asked for the version would rewrite it until it gave up. Real
 * commander and real yargs both print the version and exit 0 for the identical program.
 *
 * `-V` is commander's spelling, and `commander-command.ts` already defaults to
 * `-V, --version`. Like `HELP_FLAGS` above, this does not check whether the root declares
 * an option of the same name: a root that is not runnable has no path that would answer it.
 */
export async function unresolved({ manifest, root, io }: Resolving, argv: string[], at: CommandNode | undefined): Promise<{ text: string; code: ExitCodeType }> {
  const node = at ?? rootNode(manifest, root);
  const typed = argv.slice(node.path.length - root.length);
  const first = typed[0] ?? '';
  if (typed.length > 0 && HELP_FLAGS.has(first)) {
    // F2 — `--help --json` is help *as data*. Before this it printed the same prose as
    // `--help`, so a caller who asked for a machine-readable answer got one they had to
    // parse, which is the failure the whole `--json` surface exists to avoid. The document is
    // `commandSchemaOf` for this node plus its immediate children, so the shape a reader
    // already knows from `--schema` is the shape they get here, scoped to one command.
    if (beforeTerminator(typed).some(isJsonFlag)) return { text: `${await machineJson(await helpDocumentOf(manifest, node), beforeTerminator(argv))}\n`, code: ExitCode.OK };
    return { text: await renderHelp(manifest, node, io), code: ExitCode.OK };
  }
  if (first === '--version' || first === '-V') return { text: `${versionOf(manifest, io)}\n`, code: ExitCode.OK };
  if (typed.length === 0) return { text: await renderHelp(manifest, node, io), code: ExitCode.USAGE };
  throw new UsageError(`unknown command "${typed[0] ?? ''}"`, 'run --help to see the available commands');
}

/**
 * `completion <shell>` is synthesised unless the program defines its own `completion`
 * command (D2). The templates are loaded only here, on that command (K6): a program pays
 * for them when it prints a completion script, never at startup.
 */
async function completion(manifest: Manifest, argv: string[], io: SurfaceIo): Promise<boolean> {
  if (argv[0] !== 'completion' || manifest.find([...manifest.rootPath, 'completion']) !== undefined) return false;
  const { renderCompletion, renderFigSpec, SHELLS } = await import('./completions.js');
  const shell = argv[1] ?? '';
  if (shell === 'fig') {
    io.out.write(`${JSON.stringify(renderFigSpec(manifest), null, 2)}\n`);
    return true;
  }
  const known = SHELLS.find((s) => s === shell);
  if (known === undefined) throw new UsageError(`unknown shell "${shell}"`, `completion ${SHELLS.join('|')}|fig`);
  io.out.write(renderCompletion(manifest, known));
  return true;
}

/** `help [command…]` is synthesised for every program (yargs #1020): the named node's help, or the root's. */
async function helpCommand(manifest: Manifest, argv: string[], root: string[], io: SurfaceIo): Promise<string> {
  const { node } = manifest.resolve(argv, root);
  return renderHelp(manifest, node ?? rootNode(manifest, root), io);
}

/**
 * `--schema` (F1, N8) and `--mcp` (N1) are served for every program from the manifest
 * alone, before any command resolves: no config, no network, no handler runs.
 */
export async function serve(manifest: Manifest, argv: string[], io: SurfaceIo, engine: Engine): Promise<boolean> {
  const head = beforeTerminator(argv);
  if (argv[0] === '__complete') {
    await (await import('./complete-dynamic.js')).completeDynamic(manifest, argv.slice(1), (t) => io.out.write(t));
    return true;
  }
  // V8 / D-117 — `config explain`, synthesised for a program that reads config and does not
  // define the command itself. Imported only on this path (M2).
  const root = manifest.rootPath;
  if (head[0] === 'config' && head[1] === 'explain' && manifest.config !== undefined && manifest.find([...root, 'config', 'explain']) === undefined) {
    const { explainConfig } = await import('./config-explain.js');
    io.out.write(await explainConfig(manifest, head.slice(2), engine.resolution));
    return true;
  }
  if (await completion(manifest, argv, io)) return true;
  if (argv[0] === 'help') {
    io.out.write(await helpCommand(manifest, argv.slice(1), manifest.rootPath, io));
    return true;
  }
  if (head.includes('--schema')) {
    // The whole surface is its own chunk (M2): only `--schema` loads it, or the schema it serves.
    const { schemaSurface } = await import('./schema-surface.js');
    io.out.write(`${await machineJson(await schemaSurface(manifest, argv), head)}\n`);
    return true;
  }
  if (head[0] === '--mcp') {
    const invoke = async (args: string[]): Promise<{ stdout: string; stderr: string; code: number }> => {
      const out: string[] = [];
      const err: string[] = [];
      let code = 0;
      await engine.execute(manifest, {
        argv: args,
        env: io.env,
        stdout: { write: (s: string) => out.push(s) },
        stderr: { write: (s: string) => err.push(s) },
        exit: (c: number) => {
          code = c;
        },
      });
      return { stdout: out.join(''), stderr: err.join(''), code };
    };
    // Loaded on the branch that uses it: `--mcp` serves a protocol until stdin closes, and
    // a program that never speaks it should not carry the server. A bundler with code
    // splitting leaves `mcp.js` off the startup path once it is reached this way.
    const { serveMcp } = await import('./mcp.js');
    await serveMcp(manifest, { input: io.stdin, output: io.out, invoke });
    return true;
  }
  return false;
}
