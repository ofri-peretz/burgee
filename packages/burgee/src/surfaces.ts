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
import { dirname, join, resolve } from 'node:path';

import { ConfigError, type Resolution } from 'seniority/precedence';

import { detectAgent } from './agent.js';
import { beforeTerminator, isJsonFlag } from './argv.js';
import { UsageError } from './errors.js';
import { ExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { globalRows, globalsOf, leadingGlobals } from './globals.js';
import { type ArgumentSpec, type CommandNode, type Manifest, type OptionSpec } from './manifest.js';
import { kebab } from './names.js';
import { type Package } from './pkg.js';
import { completionNode, exitRows, rootExamples } from './root-help.js';
import { builtin } from './runtime.js';
import { suggestSimilar } from './suggest.js';
import { Again, jsonSpelling, shellWord, textSpelling } from './unknown-option.js';
import { childrenOf, groupUsage, listed, runnableBelow } from './usage.js';

/** The slice of the engine's `Io` a surface reads. */
export interface SurfaceIo {
  /** `isTTY` decides whether help is coloured (O2): the output side, never whether to ask (N12). */
  out: { write: (s: string) => unknown; isTTY?: boolean };
  env: Record<string, string | undefined>;
  width: number;
  stdin: NodeJS.ReadableStream;
  /** The package.json owning the entry file, read once (V4). */
  pkg: Package | undefined;
  /** `RunOptions.locale` (`localised-human-surfaces` R2). */
  locale?: string | undefined;
}

/** What a surface needs back from the engine: precedence for `config explain`, a run for `--mcp`. */
export interface Engine {
  resolution: (specs: Record<string, OptionSpec>, flags: Record<string, unknown>) => Promise<Resolution>;
  execute: (
    manifest: Manifest,
    opts: { argv: string[]; env: Record<string, string | undefined>; stdout: { write: (s: string) => unknown }; stderr: { write: (s: string) => unknown }; exit: (code: number) => void; locale?: string },
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
  // clispec-conformance R4, R5 — with the clispec keys `--schema` gives the same command, so the shape stays one.
  const { commandKeysOf } = await import('./clispec.js');
  return {
    schemaVersion: 1,
    ...commandSchemaOf(node, root),
    ...commandKeysOf(node, root),
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
 * `help.js` is 4.1 KB and it reaches `linegauge` for column measurement, another 6.1 KB, and
 * `roundel/policy` for whether to colour — together a third of the core entry, on a path a program takes when someone asks for help
 * and never otherwise. Reached through `await import()`, a bundler with code splitting
 * leaves all of it off the startup path.
 */
// `argv` is what the colour policy reads `--color`/`--no-color` from. The one caller without it
// is `--help` on a runnable command, whose strict parse has already refused a flag it does not
// declare, so a `--no-color` never reaches it there.
//
// The commands it lists are the refusal's (`listed`): every one that runs, by its full path, when
// they fit. The rule is passed in rather than imported by `help.js`: the `./help` door's budget
// could not carry the whole of `usage.js`, and this module already loads it.
//
// At the root, the engine's own rows follow, from `root-help.js` and for the same reason: the
// `completion` it serves unless the program declares its own (agent-lint-conformance R5), then the
// exit-code contract under `Exit codes:` (R4); and the root's examples are its own or, failing
// those, each top-level command's first (R6).
/** What the root's line for agents adds when `AGENTS.md` is there (agent-skill R4). */
const AGENTS_LINE = ' AGENTS.md beside this program says how to drive it.';

/**
 * agent-skill R4 — whether an `AGENTS.md` sits beside the program's binary or in the directory
 * above it: the `bin` its owning package.json names, which is where `burgee skill` writes it, and
 * the two places cli-agent-lint's SD-5 looks. Help never names a file that is not there.
 */
function agentsBeside(pkg: Package | undefined): boolean {
  const bin = pkg?.data['bin'];
  if (pkg === undefined || bin === undefined || bin === null) return false;
  const { existsSync } = builtin('node:fs');
  const bins = typeof bin === 'string' ? [bin] : Object.values(bin as Record<string, unknown>).filter((b): b is string => typeof b === 'string');
  return bins.some((b) => {
    const dir = dirname(resolve(dirname(pkg.path), b));
    return existsSync(join(dir, 'AGENTS.md')) || existsSync(join(dirname(dir), 'AGENTS.md'));
  });
}

const renderHelp = async (manifest: Manifest, node: CommandNode, io: SurfaceIo, argv: readonly string[] = []): Promise<string> => {
  const help = await import('./help.js');
  const { local, view } = await localised(manifest, node, io);
  const atRoot = node.path.length === manifest.rootPath.length;
  const completion = atRoot ? completionNode(manifest) : undefined;
  const commands = [...listed(manifest, node), ...(completion === undefined ? [] : [completion]), ...(atRoot ? exitRows(manifest.rootPath, local && ((s) => local.say(s, 'exit.'))) : [])].map(view);
  const shown = view(atRoot ? { ...node, examples: rootExamples(manifest, node) } : node);
  // The globals this command leaves global (R1–R3); none on a node the engine made up, such as
  // `completion`, which parses none of them.
  const globals = manifest.find(node.path) === undefined ? [] : globalRows(node);
  const say = local && ((s: string): string => local.say(s, 'help.'));
  // agent-skill R4 — the root's line for agents names `AGENTS.md` when one is there to read.
  const agents = atRoot && agentsBeside(io.pkg) ? AGENTS_LINE : '';
  return help.renderHelp(manifest, shown, { width: io.width, color: help.colorFor(io.env, detectAgent(io.env, io.out.isTTY === true).interactive, argv), commands, globals, forAgents: agents, ...(say === undefined ? {} : { say }) });
};

/** Whether a declaration was written with a localised text (R5): `execute.ts` marks it so. */
const marked = (o: object): boolean => Symbol.for('burgee.l10n') in o;

/**
 * `localised-human-surfaces` R2 — help's language: the pack's translator for the engine's words
 * (R1), and the view of a command in the run's locale for the author's (R5). Only a program that
 * registered `locales` or wrote a localised text loads `locale.js`; the rest pay two `some()`s
 * and get the identity. A pack that cannot be rendered is refused here, on the help it would
 * have translated (R4).
 */
async function localised(manifest: Manifest, node: CommandNode, io: SurfaceIo): Promise<{ local?: import('./locale.js').Localiser | undefined; view: (c: CommandNode) => CommandNode }> {
  const authored = [node, ...manifest.commands].some((c) => marked(c) || Object.values(c.options).some(marked) || (c.examples ?? []).some(marked));
  if (!authored && !manifest.plugins.some((p) => 'locales' in p)) return { view: (c) => c };
  const { commandInLocale, localiserOf, resolveLocale } = await import('./locale.js');
  const locale = resolveLocale(io.locale, io.env);
  return { local: localiserOf(manifest.plugins, locale), view: (c) => commandInLocale(c, locale) };
}

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
//
// `color` is the caller's `--no-color` / `--color=<when>`, read by `globals.js` before the parse
// (agent-lint-conformance R1), so `--help` on a command that runs is coloured as asked.
export async function helpFor(manifest: Manifest, node: CommandNode, io: SurfaceIo, { json, color = [] }: { json: boolean; color?: readonly string[] | undefined }): Promise<string> {
  if (json) return `${await machineJson(await helpDocumentOf(manifest, node), ['--json'])}\n`;
  return await renderHelp(manifest, node, io, color);
}

/** `--version`: the declared version, else the owning package.json's (V4). */
/** The program's version: declared to `defineProgram`, else the owning package.json's (V4), else none. */
const declaredVersion = (manifest: Manifest, io: Pick<SurfaceIo, 'pkg'>): string | undefined => manifest.version ?? (typeof io.pkg?.data['version'] === 'string' ? io.pkg.data['version'] : undefined);

export function versionOf(manifest: Manifest, io: Pick<SurfaceIo, 'pkg'>): string {
  const declared = declaredVersion(manifest, io);
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
  const before = argv.slice(0, node.path.length - root.length);
  // agent-lint-conformance R1–R3 — globals typed ahead of the command (`demo --quiet greet ada`)
  // resolved nothing, because the command is the next word. When the words after them name a
  // command that runs, the same line runs with the globals behind it, where the parse takes them
  // (`Again`, as a `--json` typed first does); otherwise they are read here, for help's colour.
  const { globals, words: typed } = leadingGlobals(argv.slice(before.length));
  if (globals.length > 0) {
    const reached = manifest.resolve([...before, ...typed], root);
    if (reached.node?.run !== undefined) throw new Again(lineWords(reached.node.path, reached.rest, undefined, globals));
    argv = [...argv, ...globalsOf(globals, node).color];
  }
  const first = typed[0] ?? '';
  if (typed.length > 0 && HELP_FLAGS.has(first)) {
    // F2 — `--help --json` is help *as data*. Before this it printed the same prose as
    // `--help`, so a caller who asked for a machine-readable answer got one they had to
    // parse, which is the failure the whole `--json` surface exists to avoid. The document is
    // `commandSchemaOf` for this node plus its immediate children, so the shape a reader
    // already knows from `--schema` is the shape they get here, scoped to one command.
    if (beforeTerminator(typed).some(isJsonFlag)) return { text: `${await machineJson(await helpDocumentOf(manifest, node), beforeTerminator(argv))}\n`, code: ExitCode.OK };
    return { text: await renderHelp(manifest, node, io, argv), code: ExitCode.OK };
  }
  if (first === '--version' || first === '-V') return { text: `${versionOf(manifest, io)}\n`, code: ExitCode.OK };
  if (typed.length === 0) return { text: await renderHelp(manifest, node, io, argv), code: ExitCode.USAGE };
  const refusal = unknownCommand({ manifest, root, io }, node, before, typed);
  throw refusal;
}

/**
 * D-20260930 — an unknown command names what exists, as git does. With one command near
 * enough, `fix` is the caller's own line with the word corrected, runnable as it stands; with
 * none, or a tie, the error carries the group's commands and points at `--schema` and
 * `--explain` (D-20261009-b1-totals-and-explain: an agent that guessed `demo grace` was asking
 * where a value comes from, and `--schema` alone cannot answer that), and
 * guesses nothing (E3: an executed guess burns the turn `fix` exists to save). The hint names
 * the flag and not `<program> --schema`: a program is often run under another name (`node
 * cli.mjs`, an alias, a wrapper), and B1 watched an agent run the declared name literally.
 *
 * The listing is the commands that run, each with what it takes (`groupUsage`), and the fix
 * carries the caller's request for JSON in burgee's spelling, wherever it was typed — so
 * `get user.name --format json` is one line to run, not two refusals in a row.
 */
/**
 * clispec-conformance R7 — `--format text` typed before a command that runs is a request for what
 * that command prints anyway: the line runs without it.
 */
function textAsked(manifest: Manifest, root: string[], before: string[], typed: string[]): Again | undefined {
  const text = textSpelling(typed, 0);
  const plain = manifest.resolve([...before, ...typed.slice(text)], root);
  return text > 0 && plain.node?.run !== undefined ? new Again(lineWords(plain.node.path, plain.rest, undefined)) : undefined;
}

function unknownCommand({ manifest, root }: Resolving, from: CommandNode, before: string[], typed: string[]): UsageError | Again {
  const text = textAsked(manifest, root, before, typed);
  if (text !== undefined) return text;
  const { words: all, json } = jsonAsked(typed);
  const lead = typed[0] as string;
  // A request for JSON typed before the command — `--json config get key`, `--format json …` — is
  // a request for that command's `--json`. When what follows it names a command that runs, that
  // command runs with `--json` where it is parsed (D-20261009-json-asked-is-json): the words are
  // the caller's, in the caller's order, and only the request moved. A command that declares an
  // option near `--format` itself owns the word, so that one is a refusal with the fix.
  const reached = manifest.resolve([...before, ...all], root);
  const node = reached.node ?? from;
  if ((isJsonFlag(lead) || jsonSpelling(typed, 0) > 0) && node.run !== undefined) {
    const flag = lead.split('=')[0] as string;
    if (isJsonFlag(lead) || suggestSimilar(flag, Object.keys(node.options).map((o) => `--${kebab(o)}`)) === '') return new Again(lineWords(node.path, reached.rest, json));
    return Object.assign(new UsageError(`unknown option ${flag}`, 'did you mean --json?'), { fix: line(node.path, reached.rest, json) });
  }
  // From where the request for JSON left off: `--format json config user.name` is `config
  // user.name` with `--json`, and the word to correct is `user.name`, not `config`.
  before = node.path.slice(root.length);
  const rest = reached.rest;
  // A word typed with dashes where a command goes is matched by its name: `--get` is `get`. The
  // dashes are not part of any command's name, and matched with them `--get` came out `--eet`.
  const first = rest[0] ?? lead;
  const name = first.replace(/^-+/u, '');
  const said = suggestSimilar(name, childrenOf(manifest, node).map((c) => c.path.at(-1) as string));
  const near = meant(manifest, node, name, said);
  // A word near no command's name, and not a flag, may be what a command takes: `config user.name`
  // is `config get user.name`. Then the fix keeps every word and inserts the command before them.
  const takes = near === undefined && said === '' && !first.startsWith('-') ? argumentOf(manifest, node, rest) : undefined;
  if (takes !== undefined) {
    return Object.assign(new UsageError(`unknown command "${first}"`, `did you mean ${[...takes, first].join(' ')}?`), { fix: line([...root, ...before, ...takes], rest, json) });
  }
  if (near === undefined) {
    const hint = said === '' ? 'run --schema for every command and option as JSON, in one call; --explain <option> says where a value came from' : said.trim().slice(1, -1).replace('Did', 'did');
    return Object.assign(new UsageError(`unknown command "${first}"`, hint), { usage: groupUsage(manifest, node) });
  }
  const error = new UsageError(`unknown command "${first}"`, `did you mean ${near.join(' ')}?`);
  return Object.assign(error, { fix: line([...root, ...before, ...near], rest.slice(1), json) });
}

/**
 * The command the caller's words are the arguments of, as the words to type from `node`, or
 * nothing when that is a guess.
 *
 * B1: `demo config user.name --format json` was refused with the group's list and no fix, and the
 * run spent a turn learning the word was `get`. When one command below the group takes
 * arguments, it is that one; when several do, the one whose arguments the leading words fit —
 * `config user.name` fits `get <key>` and not `set <key> <value>`. Two that fit is a guess.
 */
function argumentOf(manifest: Manifest, node: CommandNode, words: string[]): string[] | undefined {
  const takers = runnableBelow(manifest, node).filter((c) => (c.arguments ?? []).length > 0);
  const flag = words.findIndex((w) => w.startsWith('-'));
  const count = flag < 0 ? words.length : flag;
  const fits = (c: CommandNode): boolean => {
    const args = c.arguments as ArgumentSpec[];
    return count >= args.filter((a) => a.required !== false).length && (count <= args.length || (args.at(-1) as ArgumentSpec).variadic === true);
  };
  const one = takers.length === 1 ? takers : takers.filter(fits);
  return one.length === 1 ? (one[0] as CommandNode).path.slice(node.path.length) : undefined;
}

/**
 * The command a word meant, as the words to type from `node`, or nothing when that is a guess.
 *
 * A word that is exactly the name of one command deeper down is that command — `get` is
 * `config get` — ahead of a sibling a few edits away. B1's agents typed `get` without `config` in
 * 18 of 40 runs of the two tasks that read config; `get` is two edits from `greet`, so the fix
 * said `greet user.name`, and four of those runs ran it. Otherwise, the one sibling `said` names.
 */
function meant(manifest: Manifest, node: CommandNode, word: string, said: string): string[] | undefined {
  const exact = runnableBelow(manifest, node).filter((c) => c.path.length > node.path.length + 1 && c.path.at(-1) === word);
  if (exact.length === 1) return (exact[0] as CommandNode).path.slice(node.path.length);
  // String slicing, not a regex over the typed word (CodeQL js/polynomial-redos): `suggestSimilar`
  // says `\n(Did you mean X?)` for one match and `\n(Did you mean one of X, Y?)` for a tie.
  const one = said.startsWith('\n(Did you mean ') && !said.startsWith('\n(Did you mean one of ');
  return one ? [said.slice('\n(Did you mean '.length, -'?)'.length)] : undefined;
}

/**
 * The words with every request for JSON taken out — `--json`, `--json=<fields>`, and the
 * spellings other CLIs use for it (`jsonSpelling`) — and the flag that asks for it in burgee's
 * own spelling. Nothing after `--` is read: that is the handler's (G5).
 */
function jsonAsked(typed: string[]): { words: string[]; json?: string } {
  const end = typed.includes('--') ? typed.indexOf('--') : typed.length;
  for (let at = 0; at < end; at++) {
    const word = typed[at] as string;
    const spelled = jsonSpelling(typed, at);
    const taken = isJsonFlag(word) ? 1 : spelled;
    if (taken > 0) return { words: [...typed.slice(0, at), ...typed.slice(at + taken)], json: spelled > 0 ? '--json' : word };
  }
  return { words: typed };
}

/** A command line's words: the path, the caller's own words, and `--json` before any `--`. */
//
// The globals typed ahead of a command (R1–R3) go in the same place `--json` does.
function lineWords(path: string[], words: string[], json: string | undefined, globals: readonly string[] = []): string[] {
  const end = words.includes('--') ? words.indexOf('--') : words.length;
  return [...path, ...words.slice(0, end), ...(json === undefined ? [] : [json]), ...globals, ...words.slice(end)];
}

/** A command line to run, quoted for a shell. */
const line = (path: string[], words: string[], json: string | undefined): string => lineWords(path, words, json).map(shellWord).join(' ');

/**
 * `completion <shell>` is synthesised unless the program defines its own `completion`
 * command (D2). The templates are loaded only here, on that command (K6): a program pays
 * for them when it prints a completion script, never at startup.
 */
//
// Now that root help lists it (R5), it answers the two questions a listed command is asked:
// `completion --help` prints its help, and `completion --schema` is left to the schema surface,
// which publishes it. Both used to be refused as an unknown shell.
async function completion(manifest: Manifest, argv: string[], io: SurfaceIo): Promise<boolean> {
  const node = completionNode(manifest);
  if (argv[0] !== 'completion' || node === undefined || beforeTerminator(argv).includes('--schema')) return false;
  const shell = argv[1] ?? '';
  if (HELP_FLAGS.has(shell)) {
    io.out.write(await renderHelp(manifest, node, io, argv));
    return true;
  }
  const { renderCompletion, renderFigSpec, SHELLS } = await import('./completions.js');
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
  return renderHelp(manifest, node ?? rootNode(manifest, root), io, argv);
}

/**
 * D-151 — `schema` is `--schema` spelled as a subcommand: `schema [command…] [--field <path>]`
 * is the same request as `--schema [command…] [--field <path>]`, answered by the same surface,
 * byte for byte. clispec.dev discovers a program's schema by running `<tool> schema`, and a
 * program that answered only the flag was invisible to every check that followed from it.
 *
 * **The program's own meaning of the word wins.** A declared `schema` command runs as written,
 * and so does a runnable root that takes positionals, where `schema` is an argument. Either
 * way burgee answers nothing, the way `completion` stands aside for a program's own (D2).
 * Returns the argv the `--schema` surface reads, or `undefined` when this is not the alias.
 */
function schemaAlias(manifest: Manifest, argv: string[]): string[] | undefined {
  const top = manifest.find(manifest.rootPath);
  const takesWords = (top?.run ?? top?.load) !== undefined && (top?.arguments?.length ?? 0) > 0;
  if (argv[0] !== 'schema' || takesWords || manifest.find([...manifest.rootPath, 'schema']) !== undefined) return undefined;
  return ['--schema', ...argv.slice(1)];
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
  const asked = schemaAlias(manifest, argv) ?? argv;
  const askedHead = beforeTerminator(asked);
  if (askedHead.includes('--schema')) {
    // The whole surface is its own chunk (M2): only `--schema` loads it, or the schema it serves.
    const { schemaSurface } = await import('./schema-surface.js');
    // clispec-conformance R1 — the document always carries a version: the declared one, else the owning package.json's.
    io.out.write(`${await machineJson(await schemaSurface(manifest, asked, declaredVersion(manifest, io)), askedHead)}\n`);
    return true;
  }
  // agent-skill R2 — the program as an Agent Skill, unless the root declares a `--skill` of its own.
  if (head[0] === '--skill' && manifest.find(manifest.rootPath)?.options['skill'] === undefined) {
    // localised-human-surfaces R5 — the author's own text in the run's locale, as help shows it.
    const { view } = await localised(manifest, rootNode(manifest, manifest.rootPath), io);
    io.out.write((await import('./skill.js')).renderSkill(manifest, view));
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
        // A tool call answers an agent, so it speaks the base language whatever the server's
        // environment says (`localised-human-surfaces` R3).
        locale: 'C',
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
