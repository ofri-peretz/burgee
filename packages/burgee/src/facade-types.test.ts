/**
 * The façades' **type** surface — what a TypeScript program written against commander or
 * yargs sees after its import says `burgee/…` instead.
 *
 * The runtime drop-in is graded elsewhere (`npm run compat`: commander's and yargs' own
 * suites). That says nothing about the types: `burgee/yargs` shipped with no `Argv`,
 * `Arguments` or `CommandModule` at all, and `burgee migrate` rewrote
 * `import type { Argv } from 'yargs'` to a module that did not have it — every one of the
 * three TypeScript + yargs adoption targets (`.sdlc/research/adoption-targets.md`) would
 * have come out of the codemod not compiling.
 *
 * So this compiles programs, the way a user's project would: real `tsc`, `strict`,
 * `NodeNext`, resolving `burgee/yargs` and `burgee/commander` through the package's
 * `exports` map to the **built** `dist/*.d.ts` (`turbo.json` makes `test` depend on
 * `build`). The fixtures are written in the incumbents' own documented idiom — yargs'
 * `docs/typescript.md` and `docs/advanced.md`, commander's README — plus the exact shapes
 * the adoption targets use (`UnpackArgv<ReturnType<typeof builder>>`, a `CommandModule`
 * object, `import yargs, { Argv }` without a `type` modifier).
 *
 * ## Proved red
 *
 * Against the tree before this change, every block below failed: the yargs fixtures on
 * TS2305 (`Module '"burgee/yargs"' has no exported member 'Argv'`, and so on for each
 * name), the commander fixture on TS2305 for `OptionValues` / `OptionValueSource` /
 * `HelpConfiguration` / `ParseOptionsResult` and TS2558 on `opts<T>()`, the coverage lock
 * on 28 missing yargs names and 4 missing commander names, and the migrated demo on
 * `Argv`. The PR records the output.
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { FACADE_EXPORTS, migrate } from './migrate.js';
import yargs from './yargs.js';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLES = resolve(PKG, '../../examples');

/**
 * Where the fixture files pretend to live. Inside the package, so the nearest
 * `package.json` is burgee's (`"type": "module"`, so the files are ESM) and `burgee/…`
 * resolves the way it does for any consumer — through `node_modules/burgee` and the
 * `exports` map to `dist`. Nothing is written there: the host serves these from memory.
 */
const ROOT = join(PKG, '.type-fixture');

/** What a strict, modern TypeScript project compiles with. No `verbatimModuleSyntax`: devcontainers imports `Argv` without `type`. */
const OPTIONS: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  lib: ['lib.es2022.d.ts'],
  types: ['node'],
  skipLibCheck: true,
  noEmit: true,
};

/**
 * TypeScript hands its host forward-slash paths on every platform, so the in-memory keys are
 * normalised the same way — a `join()` key is backslashed on Windows and never matched.
 */
const slash = (path: string): string => path.replaceAll('\\', '/');

/** A program over in-memory files; the real filesystem answers everything else. */
function program(files: Record<string, string>): ts.Program {
  const virtual = new Map(Object.entries(files).map(([name, text]) => [slash(join(ROOT, name)), text]));
  const host = ts.createCompilerHost(OPTIONS);
  const { getSourceFile, fileExists, readFile, directoryExists } = host;
  const dirs = new Set([...virtual.keys()].flatMap((f) => [dirname(f), slash(ROOT)]));
  host.fileExists = (f) => virtual.has(f) || fileExists.call(host, f);
  host.readFile = (f) => virtual.get(f) ?? readFile.call(host, f);
  host.directoryExists = (d) => dirs.has(d) || (directoryExists?.call(host, d) ?? true);
  host.getSourceFile = (f, version, ...rest) => {
    const text = virtual.get(f);
    return text === undefined ? getSourceFile.call(host, f, version, ...rest) : ts.createSourceFile(f, text, version, true);
  };
  return ts.createProgram([...virtual.keys()], OPTIONS, host);
}

/** Every diagnostic, as `file:line TSnnnn message` — the form a failing assertion should print. */
function typeErrors(files: Record<string, string>): string[] {
  return ts.getPreEmitDiagnostics(program(files)).map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    if (d.file === undefined || d.start === undefined) return `TS${d.code} ${message}`;
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${d.file.fileName.replace(`${slash(ROOT)}/`, '')}:${line + 1} TS${d.code} ${message}`;
  });
}

/** The names a module exports, as the checker sees them from an ESM importer. */
function exportsOf(specifiers: string[]): Record<string, string[]> {
  const files = Object.fromEntries(specifiers.map((s, i) => [`probe-${i}.ts`, `export * as m from '${s}';\n`]));
  const prog = program(files);
  const checker = prog.getTypeChecker();
  return Object.fromEntries(
    specifiers.map((s, i) => {
      const source = prog.getSourceFile(slash(join(ROOT, `probe-${i}.ts`)));
      const decl = source?.statements[0];
      if (decl === undefined || !ts.isExportDeclaration(decl) || decl.moduleSpecifier === undefined) throw new Error(`no probe for ${s}`);
      const mod = checker.getSymbolAtLocation(decl.moduleSpecifier);
      if (mod === undefined) throw new Error(`${s} does not resolve`);
      // With properties: `closeout/signal-exit` is CommonJS, `export = { onExit, … }`, and
      // TypeScript accepts `import { onExit }` from it — `getExportsOfModule` alone reports
      // none of those names, and would have the table refuse an import that compiles.
      return [s, checker.getExportsAndPropertiesOfModule(mod).map((e) => e.name).sort()];
    }),
  );
}

/* ----------------------------------------------------------------- the fixtures */

/** yargs' `docs/typescript.md`, near enough verbatim, plus the names a typed program imports. */
const YARGS_DOCS = `
import yargs, {
  type Arguments,
  type ArgumentsCamelCase,
  type Argv,
  type CommandBuilder,
  type CommandModule,
  type InferredOptionTypes,
  type MiddlewareFunction,
  type Options,
  type ParseCallback,
  type PositionalOptions,
} from 'burgee/yargs';
import { hideBin } from 'burgee/yargs/helpers';

// .options() infers argv
const argv = yargs(hideBin(process.argv))
  .options({
    a: { type: 'boolean', default: false },
    b: { type: 'string', demandOption: true },
    c: { type: 'number', alias: 'chill' },
    d: { type: 'array' },
    e: { type: 'count' },
    f: { choices: ['1', '2', '3'] as const },
  })
  .parseSync();
export const a: boolean = argv.a;
export const b: string = argv.b;
export const c: number | undefined = argv.c;
export const d: (string | number)[] | undefined = argv.d;
export const e: number = argv.e;
export const f: '1' | '2' | '3' | undefined = argv.f;

// an interface for argv
interface Args {
  [x: string]: unknown;
  a: boolean;
  b: string;
}
export const typed: Args = yargs(hideBin(process.argv))
  .options({ a: { type: 'boolean', default: false }, b: { type: 'string', demandOption: true } })
  .parseSync();

// the async parse
export async function greeting(): Promise<string> {
  const parsed = await yargs(hideBin(process.argv)).option('name', { type: 'string', default: 'world' }).parseAsync();
  return parsed.name;
}

// a command module (docs/advanced.md) — spectral's \`lint\` is one
interface GreetArgs {
  name: string;
  loud: boolean | undefined;
}
export const greet: CommandModule<{}, GreetArgs> = {
  command: 'greet <name>',
  describe: 'greet someone',
  builder: (y) => y.positional('name', { type: 'string', demandOption: true }).option('loud', { type: 'boolean' }),
  handler: (args) => {
    console.log(args.loud === true ? args.name.toUpperCase() : args.name);
  },
};

// shared option tables
const shared = { port: { type: 'number', default: 8080, describe: 'the port' } } satisfies Record<string, Options>;
export type Shared = ArgumentsCamelCase<InferredOptionTypes<typeof shared>>;
export const port = (s: Shared): number => s.port;
export const where: PositionalOptions = { type: 'string', describe: 'where to run' };
const provision: CommandBuilder = (y) => y.positional('where', where);
export const up: CommandModule = { command: 'up [where]', describe: 'provision', builder: provision, handler: (args) => void args['where'] };

const logging: MiddlewareFunction<{ verbose: boolean }> = (args) => {
  if (args.verbose) console.error(args._, args.$0);
};
const onParse: ParseCallback = (err, parsed, output) => {
  if (err !== undefined) console.error(output, parsed.$0);
};

export async function run(): Promise<void> {
  const cli: Argv = yargs(hideBin(process.argv));
  await cli
    .options(shared)
    .option('verbose', { type: 'boolean', default: false })
    .command(greet)
    .command(up)
    .command('down [where]', 'tear down', (y) => y.positional('where', where), (args: Arguments) => void args['where'])
    .middleware(logging)
    .demandCommand(1)
    .strict()
    .parseAsync();
  yargs().parse('greet ada', {}, onParse);
}

export const all: Arguments = yargs().parseSync();
`;

/**
 * \`@devcontainers/cli\`'s shape: \`Argv\` imported *without* \`type\`, builders that take and
 * return it, and the handler's argument type recovered from the builder's return type.
 */
const YARGS_DEVCONTAINERS = `
import yargs, { Argv } from 'burgee/yargs';

type UnpackArgv<T> = T extends Argv<infer U> ? U : T;

function provisionOptions(y: Argv) {
  return y.options({
    'workspace-folder': { type: 'string', description: 'Workspace folder path.' },
    'log-level': { choices: ['info' as 'info', 'debug' as 'debug', 'trace' as 'trace'], default: 'info' as 'info' },
  });
}
type ProvisionArgs = UnpackArgv<ReturnType<typeof provisionOptions>>;

function provisionHandler(args: ProvisionArgs): void {
  const level: 'info' | 'debug' | 'trace' = args['log-level'];
  const folder: string | undefined = args['workspace-folder'];
  console.log(level, folder);
}

const y = yargs([]).parserConfiguration({ 'boolean-negation': false }).scriptName('devcontainer').version('1.0.0').demandCommand().strict();
y.wrap(Math.min(120, y.terminalWidth()));
y.command('up', 'Create and run dev container', provisionOptions, provisionHandler);
y.epilog('devcontainer <command> --help');
y.parse();
`;

/** commander's README, in TypeScript, touching every type it exports. */
const COMMANDER_README = `
import {
  Argument,
  Command,
  CommanderError,
  Help,
  InvalidArgumentError,
  Option,
  createArgument,
  createCommand,
  createOption,
  program,
  type AddHelpTextContext,
  type AddHelpTextPosition,
  type CommandOptions,
  type ErrorOptions,
  type ExecutableCommandOptions,
  type HelpConfiguration,
  type HelpContext,
  type HookEvent,
  type OptionValueSource,
  type OptionValues,
  type OutputConfiguration,
  type ParseOptions,
  type ParseOptionsResult,
} from 'burgee/commander';

function myParseInt(value: string, _previous: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new InvalidArgumentError('Not a number.');
  return parsed;
}

program
  .name('pizza')
  .description('CLI to order pizza')
  .version('0.8.0')
  .option('-p, --port <number>', 'port number', '80')
  .option('-i, --integer <n>', 'an integer', myParseInt, 0)
  .addOption(new Option('-d, --drink <size>', 'drink size').choices(['small', 'medium', 'large']))
  .addArgument(new Argument('[dir]', 'directory').default('.'));

const parseOptions: ParseOptions = { from: 'user' };
program.parse(['--port', '8080'], parseOptions);

// opts() is OptionValues, and generic
const loose: OptionValues = program.opts();
export const portText: string = loose['port'];
interface PizzaOptions {
  port: string;
  integer: number;
  drink?: string;
}
const options = program.opts<PizzaOptions>();
export const port: string = options.port;
export const withGlobals = program.optsWithGlobals<PizzaOptions>().integer;
export const source: OptionValueSource = program.getOptionValueSource('port');

const result: ParseOptionsResult = program.parseOptions(['--port', '1', 'rest']);
export const operands: string[] = result.operands;

const helpConfig: HelpConfiguration = { sortSubcommands: true, subcommandTerm: (cmd) => cmd.name() };
program.configureHelp(helpConfig);

const output: OutputConfiguration = { writeErr: (str) => process.stderr.write(str) };
program.configureOutput(output);

const where: AddHelpTextPosition = 'after';
program.addHelpText(where, (context: AddHelpTextContext) => (context.error ? '' : 'Example: pizza -p 80'));
const helpContext: HelpContext = { error: false };
program.outputHelp(helpContext);

const event: HookEvent = 'preAction';
program.hook(event, (thisCommand: Command, actionCommand: Command) => {
  console.log(thisCommand.name(), actionCommand.opts());
});

program.exitOverride((err: CommanderError) => {
  throw err;
});
const errorOptions: ErrorOptions = { code: 'pizza.cold', exitCode: 2 };
export const fail = (): void => program.error('cold pizza', errorOptions);

const hidden: CommandOptions = { hidden: true };
program.command('secret', hidden).action(async (opts: OptionValues, cmd: Command) => {
  console.log(opts, cmd.args);
});
const external: ExecutableCommandOptions = { executableFile: 'pizza-install' };
program.command('install [name]', 'install one or more packages', external);

class LoudHelp extends Help {
  override formatHelp(cmd: Command, helper: Help): string {
    return super.formatHelp(cmd, helper).toUpperCase();
  }
}
class MyCommand extends Command {
  override createCommand(name?: string): MyCommand {
    return new MyCommand(name);
  }
  override createHelp(): Help {
    return new LoudHelp();
  }
}
export const custom = new MyCommand('custom');
export const made = [createCommand('a'), createOption('-x'), createArgument('<y>')];
`;

/** The same fixture, importing the incumbent: `burgee/yargs` → `yargs`, `burgee/commander` → `commander`. */
const incumbent = (source: string): string => source.replaceAll("from 'burgee/", "from '");

/* ------------------------------------------------------------------- the tests */

describe('burgee/yargs — a typed yargs program compiles against it unchanged', () => {
  it("compiles yargs' own docs/typescript.md idiom", () => {
    expect(typeErrors({ 'docs.ts': YARGS_DOCS })).toEqual([]);
  });

  it('compiles the devcontainers shape — `Argv` without `type`, `UnpackArgv<ReturnType<…>>`', () => {
    expect(typeErrors({ 'devcontainers.ts': YARGS_DEVCONTAINERS })).toEqual([]);
  });

  it('infers argv through the typed chain, not `any`', () => {
    // Red on a default export that returns an `any`-typed instance: every line above
    // would compile, and so would this one, which must not.
    const errors = typeErrors({
      'infer.ts': "import yargs from 'burgee/yargs';\nexport const n: string = yargs().option('n', { type: 'number', demandOption: true }).parseSync().n;\n",
    });
    expect(errors).toEqual([expect.stringMatching(/^infer\.ts:2 TS2322 Type 'number' is not assignable to type 'string'/)]);
  });

  it("keeps burgee's additions on the typed chain", () => {
    const errors = typeErrors({
      'extras.ts': `import yargs from 'burgee/yargs';
export const tools = yargs([])
  .command('wipe', 'delete everything', (b) => b.effects('withheld'), () => undefined)
  .burgee({ exit: () => undefined })
  .manifest;
`,
    });
    expect(errors).toEqual([]);
  });

  it('promises no method a burgee/yargs instance does not have', () => {
    // The typed surface is ported from @types/yargs, which describes yargs 17. burgee is
    // yargs 18. A method the types promise and the instance lacks is a TypeError that
    // compiles — so every member of `Argv` is checked against a live instance.
    const prog = program({ 'members.ts': "import type { Argv } from 'burgee/yargs';\nexport type A = Argv;\n" });
    const checker = prog.getTypeChecker();
    const alias = prog.getSourceFile(slash(join(ROOT, 'members.ts')))?.statements[1];
    if (alias === undefined || !ts.isTypeAliasDeclaration(alias)) throw new Error('no probe');
    const members = checker.getTypeAtLocation(alias).getProperties().map((p) => p.name);
    const instance = yargs([]) as unknown as Record<string, unknown>;
    expect(members.length, 'the probe found the interface').toBeGreaterThan(50);
    expect(members.filter((m) => !(m in instance))).toEqual([]);
  });
});

describe('burgee/commander — a typed commander program compiles against it unchanged', () => {
  it("compiles commander's README idiom, touching every exported type", () => {
    expect(typeErrors({ 'readme.ts': COMMANDER_README })).toEqual([]);
  });
});

describe('the control — the fixtures are the incumbents’ idiom, not ours', () => {
  // Every fixture above, pointed back at the incumbent, compiles against the incumbent's own
  // declarations. Without this, a fixture bent to fit burgee's types would pass and prove
  // nothing about a program someone actually wrote.
  it.each([
    ['docs.ts', YARGS_DOCS],
    ['devcontainers.ts', YARGS_DEVCONTAINERS],
    ['readme.ts', COMMANDER_README],
  ])('%s compiles against @types/yargs and commander', (name, source) => {
    expect(incumbent(source)).not.toContain('burgee');
    expect(typeErrors({ [name]: incumbent(source) })).toEqual([]);
  });
});

describe('coverage — every name the incumbent exports, the façade exports', () => {
  // Every target `migrate` can produce (A12), so the table below is held to the checker for
  // the whole family and not only the two front-ends it started with.
  const surfaces = exportsOf([...new Set(['yargs', 'yargs/helpers', 'commander', ...Object.keys(FACADE_EXPORTS)])]);

  it.each([
    // `yargs` resolves to @types/yargs' ESM entry, `index.d.mts` — the file an ESM program reads.
    ['yargs', 'burgee/yargs'],
    ['yargs/helpers', 'burgee/yargs/helpers'],
    ['commander', 'burgee/commander'],
  ])('%s ⊆ %s', (incumbent, ours) => {
    const have = new Set(surfaces[ours]);
    expect((surfaces[incumbent] ?? []).filter((name) => !have.has(name))).toEqual([]);
  });

  it("is the table `burgee migrate` checks a rewrite against — the same names, exactly", () => {
    // migrate cannot run the checker (it is a scan, D-050), so it reads a table; this is
    // what keeps the table from drifting from what the façades really export.
    for (const [target, names] of Object.entries(FACADE_EXPORTS)) {
      expect([...names].sort(), target).toEqual(surfaces[target]);
    }
  });
});

describe('burgee migrate — its output compiles', () => {
  it('migrates demo-cli-yargs to a program that type-checks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'burgee-demo-cli-yargs-'));
    cpSync(join(EXAMPLES, 'demo-cli-yargs', 'src'), join(dir, 'src'), { recursive: true });
    cpSync(join(EXAMPLES, 'demo-cli-yargs', 'package.json'), join(dir, 'package.json'));
    const report = await migrate({ dir, status: () => undefined });
    expect(report).toMatchObject({ refused: [], kept: [] });
    const files = Object.fromEntries(readdirSync(join(dir, 'src')).map((f) => [`demo/${f}`, readFileSync(join(dir, 'src', f), 'utf8')]));
    expect(Object.values(files).join('\n')).not.toMatch(/from 'yargs'/);
    expect(typeErrors(files)).toEqual([]);
  });
});
