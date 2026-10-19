/**
 * PLAN 2.5.1 — a help screen is a drawing, and a drawing is a contract.
 *
 * This repository already decided that for `boxen`: every one of its ava cases is
 * `t.snapshot(box)`, and the compat-oracle's R2 gates a drawing case when the host's
 * contract *is* its output (`.sdlc/intents/output-stack-compat/spec.md`). burgee's own
 * help had no snapshot at all — twenty by-construction fixes asserted once each, by a test
 * that names the property it is checking and therefore cannot see a change it was not
 * looking for. A snapshot sees all of them.
 *
 * Six command shapes × three widths. The widths are the plan's — 33, 80 and 120 — chosen
 * because that is where the layout changes rather than to sample it evenly: at 33 the term
 * column is clamped by `TERM_SHARE` and long terms drop their descriptions to the next
 * line, at 80 the ordinary case wraps, at 120 almost nothing wraps and the alignment is
 * what is on trial. The shapes are picked the same way: the difference between them is a
 * different decision in the renderer, not a different set of words.
 *
 * These snapshots are a record of what burgee draws, not a claim about what commander or
 * yargs draw — those are graded by `compat-oracle` against the incumbents' own suites.
 * When one of these changes, the question is "did I mean to redraw the screen", and the
 * answer is a reviewed diff, never `-u` on the way past.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { SHELLS } from './completions.js';
import { renderHelp } from './help-entry.js';
import { defineCommand, defineProgram, ExitCode, runCommand } from './index.js';
import { type CommandNode, type Manifest } from './manifest.js';
import { completionNode, EXIT_ADVICE, exitRows, producibleExits } from './root-help.js';
import { listed } from './usage.js';

const ok = (): string => 'ok';

/** The plan's three widths: clamped, ordinary, and roomy. */
const WIDTHS = [33, 80, 120] as const;

/**
 * Everything a help screen can carry, on one command: required and variadic arguments,
 * every option annotation in R4's order, a hidden option, a deprecated option, two
 * examples with and without a description, an environment section and an epilogue.
 */
const full = defineProgram({
  name: 'app',
  description: 'A fixture with every kind of help data, whose description is long enough to wrap at two of the three widths.',
  commands: [
    defineCommand({
      name: 'deploy',
      summary: 'Ship a build',
      description: 'Ship the current build to a target. This description is long enough that it must wrap at every width the renderer supports.',
      group: 'Release commands:',
      arguments: [
        { name: 'target', description: 'where to ship', required: true },
        { name: 'files', description: 'extra files', variadic: true, required: false, default: 'none' },
      ],
      options: {
        region: { type: 'string', description: 'the region', env: 'APP_REGION', choices: ['eu', 'us'], default: 'eu', placeholder: 'code' },
        force: { type: 'boolean', description: 'skip the confirmation', short: 'f' },
        legacy: { type: 'boolean', description: 'old flag', deprecated: '--force' },
        secret: { type: 'boolean', hidden: true },
      },
      examples: [
        { command: 'app deploy prod --region us', description: 'Ship to production in the US region, no confirmation.' },
        { command: 'app deploy staging' },
      ],
      epilogue: 'Deploys are logged at https://example.test/deploys.',
      effects: 'withheld',
      run: ok,
    }),
    defineCommand({ name: 'status', description: 'Show status', group: 'Release commands:', effects: 'withheld', run: ok }),
    defineCommand({ name: 'login', description: 'Sign in', effects: 'withheld', run: ok }),
    defineCommand({ name: 'hush', description: 'Never listed', hidden: true, effects: 'withheld', run: ok }),
  ],
});
// A bare `deprecated: true` is what commander and yargs declare, so it reaches the manifest
// through `add`, the façades' route: `defineCommand` refuses it and asks for the replacement (D1).
full.add({ path: ['app', 'old'], description: 'Legacy', deprecated: true, options: {}, run: ok });

/** A leaf with nothing but a name: the floor, where every section but Usage is omitted (R2). */
const bare = defineProgram({ name: 'app', commands: [defineCommand({ name: 'ping', effects: 'withheld', run: ok })] });

/**
 * Terms whose display width is not their code-unit count. This is the Job-1 fix pinned as
 * a drawing rather than as a property: the alignment test says the columns agree, the
 * snapshot says what they agree *on*.
 */
const wide = defineProgram({
  name: 'app',
  description: '宽 字符 的 命令 名 也要 对齐 到 同一 列',
  commands: [
    defineCommand({ name: 'deploy-service', description: 'ASCII: code units and columns agree', effects: 'withheld', run: ok }),
    defineCommand({ name: '部署', description: 'CJK: two code units, four columns', effects: 'withheld', run: ok }),
    defineCommand({ name: '🚀', description: 'emoji: two code units, two columns', effects: 'withheld', run: ok }),
  ],
});

/**
 * B1's demo: a command group among leaves. The engine lists every command that runs by its full
 * path when they fit (`listed`), so the root screen names `config get <key>` and not `config`.
 */
const nested = defineProgram({
  name: 'demo',
  description: 'The burgee reference demo',
  commands: [
    defineCommand({ name: 'greet', description: 'Greet someone', effects: 'read_only', arguments: [{ name: 'name', required: true }], run: ok }),
    defineCommand({
      name: 'config',
      description: 'Read configuration',
      commands: [defineCommand({ name: 'get', description: 'Print one configuration value', effects: 'read_only', arguments: [{ name: 'key', required: true }], run: ok })],
    }),
    defineCommand({ name: 'fail', description: 'Fail on purpose', effects: 'idempotent', run: ok }),
  ],
});

function node(manifest: Manifest, path: string[]): CommandNode {
  const found = manifest.find(path);
  if (found === undefined) throw new Error(`fixture: no ${path.join(' ')}`);
  return found;
}

const shapes: { name: string; manifest: Manifest; node: CommandNode; verbose: boolean; commands?: CommandNode[] }[] = [
  { name: 'a group: grouped children, a deprecated one, a hidden one omitted', manifest: full, node: node(full, ['app']), verbose: false },
  { name: 'a leaf with every field', manifest: full, node: node(full, ['app', 'deploy']), verbose: false },
  { name: 'a leaf with every field, verbose', manifest: full, node: node(full, ['app', 'deploy']), verbose: true },
  { name: 'a leaf with nothing but a name', manifest: bare, node: node(bare, ['app', 'ping']), verbose: false },
  { name: 'terms wider than their code-unit count', manifest: wide, node: node(wide, ['app']), verbose: false },
  { name: 'a root over a group, listed by the commands that run', manifest: nested, node: node(nested, ['demo']), verbose: false, commands: listed(nested, node(nested, ['demo'])) },
  // What the engine hands the renderer at the root (agent-lint-conformance R4–R6, `root-help.ts`):
  // its `completion`, the exit codes under their own heading, and the commands' first examples.
  {
    name: "the engine's root: completion, exit codes and the commands' examples",
    manifest: nested,
    node: { ...node(nested, ['demo']), examples: [{ command: 'demo greet ada' }, { command: 'demo config get user.name', description: 'one value' }] },
    verbose: false,
    commands: [...listed(nested, node(nested, ['demo'])), completionNode(nested) as CommandNode, ...exitRows(nested)],
  },
];

describe('help is a drawing, and the drawing is pinned (PLAN 2.5.1)', () => {
  for (const shape of shapes) {
    for (const width of WIDTHS) {
      it(`${shape.name}, at ${width} columns`, () => {
        expect(renderHelp(shape.manifest, shape.node, { width, verbose: shape.verbose, ...(shape.commands === undefined ? {} : { commands: shape.commands }) })).toMatchSnapshot();
      });
    }
  }
});

/**
 * agent-lint-conformance R4–R6 — the root screen carries what a caller branches on, and what to
 * type. cli-agent-lint 0.3.5 reads three of them off the root help it discovers: an `Exit codes`
 * section (PV-4), a `completion` command in the listing (SD-3) and an `Examples:` heading (SD-6).
 * Each is held here as a property of the screen, beside the drawing that pins it.
 */
/** The rows under one heading of a help screen, up to the blank line that ends the section. */
function sectionOf(text: string, title: string): string[] {
  const lines = text.split('\n');
  const at = lines.indexOf(title);
  if (at === -1) return [];
  const end = lines.findIndex((l, i) => i > at && l === '');
  return lines.slice(at + 1, end === -1 ? undefined : end);
}

/** A program that declares `auth` with this variable, not yet defined (agent-lint-conformance R8). */
const declaring = (env: string) => () => defineProgram({ name: 'x', auth: { env }, commands: [] });

/** The engine's root help for the demo-shaped fixture. */
const root = async (): Promise<string> => (await runCommand(nested, ['--help'])).stdout;

describe('the root help carries the exit codes, completion and examples (agent-lint-conformance R4–R6)', () => {

  it('R4: lists every producible ExitCode, by number and name, under "Exit codes:" after the commands', async () => {
    const text = await root();
    // One row per code; a long line of advice wraps onto a continuation, which starts with spaces.
    const rows = sectionOf(text, 'Exit codes:').filter((r) => /^ {2}\d/.test(r));
    expect(rows).toHaveLength(producibleExits(nested).length);
    for (const name of producibleExits(nested)) {
      const code = ExitCode[name];
      expect(rows.some((r) => new RegExp(`^ {2}${String(code)}\\s+${name.toLowerCase()}: \\S`).test(r)), `${name} (${String(code)}) has a line`).toBe(true);
    }
    expect(text.indexOf('Exit codes:')).toBeGreaterThan(text.indexOf('Commands:'));
    // A bare invocation prints the same screen, as the usage error it is.
    expect((await runCommand(nested, [])).stderr).toBe(text);
  });

  /**
   * R8 — cli-agent-lint's FS-4 fails a program whose help mentions `auth`, `login`, `token` or
   * `credential` without naming an env var or token flag (`checks/flow_safety.go` at v0.3.5). R4's
   * `auth` row did exactly that on every program, credential or not. Now the row is printed only
   * for a program that declares `auth`, and its advice names the variable to set.
   */
  it('R8: lists only the exit codes the program can produce; auth only when declared', async () => {
    const text = await root();
    const names = sectionOf(text, 'Exit codes:')
      .filter((r) => /^ {2}\d/.test(r))
      .map((r) => r.trim().split(/\s+/)[1]);
    expect(names).toEqual(['ok:', 'runtime:', 'usage:', 'config:', 'cancelled:', 'timeout:', 'sigint:']);
    // FS-4's step 2: no auth-related word anywhere on the screen of a program with no credential.
    for (const term of ['auth', 'login', 'token', 'credential']) expect(text.toLowerCase()).not.toContain(term);

    const declared = defineProgram({ name: 'demo', auth: { env: 'DEMO_TOKEN' }, commands: [defineCommand({ name: 'pull', description: 'Fetch', effects: 'read_only', examples: [{ command: 'demo pull' }], run: ok })] });
    const help = (await runCommand(declared, ['--help'])).stdout;
    const rows = sectionOf(help, 'Exit codes:').join(' ').replaceAll(/\s+/g, ' ');
    expect(rows).toContain('5 auth: a credential is missing or refused; set DEMO_TOKEN and run it again');
    expect(help).not.toContain('log in');
  });

  it('R8: the global --timeout steps aside for a command that declares its own, and so does its exit code', async () => {
    const own = defineProgram({ name: 'own', commands: [defineCommand({ name: 'wait', effects: 'read_only', options: { timeout: { type: 'string' } }, run: ok })] });
    expect(producibleExits(own)).not.toContain('TIMEOUT');
    expect((await runCommand(own, ['--help'])).stdout).not.toMatch(/^ {2}6 /m);
    expect(producibleExits(nested)).toContain('TIMEOUT');
  });

  it('R8: auth names a variable a shell can set, or the program does not define', () => {
    for (const bad of ['', 'demo_token', 'DEMO TOKEN', '1TOKEN', '$TOKEN']) expect(declaring(bad), bad).toThrow(/auth\.env must name an environment variable/);
    expect(declaring('DEMO_TOKEN')).not.toThrow();
  });

  it('R4: the advice is keyed by the contract, so a code without a line cannot be added', () => {
    expect(Object.keys(EXIT_ADVICE)).toEqual(Object.keys(ExitCode));
  });

  it('R4: a command below the root does not repeat the contract', async () => {
    expect((await runCommand(nested, ['greet', '--help'])).stdout).not.toContain('Exit codes:');
    expect((await runCommand(nested, ['help', 'config'])).stdout).not.toContain('Exit codes:');
  });

  it('R5: the engine root help lists completion <shell>, naming every shell it serves', async () => {
    const { stdout, code } = await runCommand(nested, ['--help']);
    expect(code).toBe(ExitCode.OK);
    const row = sectionOf(stdout, 'Commands:').find((r) => r.trimStart().startsWith('completion <shell>'));
    expect(row, stdout).toBeDefined();
    for (const shell of [...SHELLS, 'fig']) expect(row).toContain(shell);
  });

  it('R5: completion --help answers as a listed command does, and a shell still prints its script', async () => {
    const help = await runCommand(nested, ['completion', '--help']);
    expect(help.code).toBe(ExitCode.OK);
    expect(help.stdout).toMatch(/^Usage: completion \[options\] <shell>\n\nPrint a shell completion script/);
    expect((await runCommand(nested, ['completion', '-h'])).stdout).toBe(help.stdout);
    expect((await runCommand(nested, ['completion', 'bash'])).stdout).toContain('demo');
  });

  it('R5: a program that defines its own completion is listed as it declared it, once', async () => {
    const own = defineProgram({ name: 'own', commands: [defineCommand({ name: 'completion', description: 'mine', effects: 'read_only', run: ok })] });
    const { stdout } = await runCommand(own, ['--help']);
    expect(stdout.match(/^ {2}completion/gm)).toHaveLength(1);
    expect(stdout).toMatch(/^ {2}completion\s+mine$/m);
  });

  it("R6: the root's examples are its children's first examples when it declares none", async () => {
    const withExamples = defineProgram({
      name: 'demo',
      commands: [
        defineCommand({ name: 'greet', effects: 'read_only', examples: [{ command: 'demo greet ada' }, { command: 'demo greet ada --shout' }], run: ok }),
        defineCommand({ name: 'config', commands: [defineCommand({ name: 'get', effects: 'read_only', examples: [{ command: 'demo config get user.name' }], run: ok })] }),
        defineCommand({ name: 'fail', effects: 'idempotent', run: ok }),
        defineCommand({ name: 'hush', hidden: true, effects: 'withheld', examples: [{ command: 'demo hush' }], run: ok }),
        defineCommand({ name: 'secrets', hidden: true, commands: [defineCommand({ name: 'rotate', effects: 'withheld', examples: [{ command: 'demo secrets rotate' }], run: ok })] }),
      ],
    });
    expect(sectionOf((await runCommand(withExamples, ['--help'])).stdout, 'Examples:')).toEqual(['  $ demo greet ada', '  $ demo config get user.name']);
    // Below the root a command shows its own, as before.
    expect(sectionOf((await runCommand(withExamples, ['greet', '--help'])).stdout, 'Examples:')).toEqual(['  $ demo greet ada', '  $ demo greet ada --shout']);
  });

  it("R6: the root's own examples win when it declares them", async () => {
    const declared = defineProgram({
      name: 'demo',
      examples: [{ command: 'demo greet ada', description: 'the one line to try first' }],
      commands: [defineCommand({ name: 'greet', effects: 'read_only', examples: [{ command: 'demo greet grace' }], run: ok })],
    });
    expect(sectionOf((await runCommand(declared, ['--help'])).stdout, 'Examples:')).toEqual(['  $ demo greet ada', '    the one line to try first']);
  });
});

/**
 * agent-skill R4 — the root help names `AGENTS.md` only when one is there: beside the binary the
 * owning package.json's `bin` names, or in the directory above it (cli-agent-lint's SD-5 looks in
 * both). Without the file the line is byte for byte what it was.
 */
describe('the root help names AGENTS.md when it sits beside the bin (agent-skill R4)', () => {
  const project = mkdtempSync(join(tmpdir(), 'burgee-agents-'));
  afterAll(() => rmSync(project, { recursive: true, force: true }));
  mkdirSync(join(project, 'dist'));
  const entry = join(project, 'dist', 'cli.js');
  writeFileSync(entry, '');
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'demo', bin: { demo: './dist/cli.js' } }));
  const forAgents = async (): Promise<string> => {
    const { stdout } = await runCommand(nested, ['--help'], { entry });
    // One line, however the width wrapped it.
    return stdout.slice(stdout.indexOf('For agents:')).replaceAll(/\s+/g, ' ');
  };

  it('without the file, the line does not change', async () => {
    const before = await root();
    expect(await forAgents()).toBe(before.slice(before.indexOf('For agents:')).replaceAll(/\s+/g, ' '));
    expect(await forAgents()).not.toContain('AGENTS.md');
  });

  it('with AGENTS.md beside the bin, or in the directory above it, the line names it', async () => {
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS.md\n');
    expect(await forAgents()).toContain('AGENTS.md beside this program says how to drive it.');
    rmSync(join(project, 'AGENTS.md'));
    writeFileSync(join(project, 'dist', 'AGENTS.md'), '# AGENTS.md\n');
    expect(await forAgents()).toContain('AGENTS.md beside this program says how to drive it.');
    // A command's own help is one command; the root's line is the root's.
    expect((await runCommand(nested, ['greet', '--help'], { entry })).stdout).not.toContain('AGENTS.md');
  });

  it('a package with no bin, or a bin that is not a path, names nothing', async () => {
    writeFileSync(join(project, 'dist', 'AGENTS.md'), '# AGENTS.md\n');
    const named = async (bin: unknown): Promise<boolean> => {
      writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'demo', ...(bin === undefined ? {} : { bin }) }));
      return (await forAgents()).includes('AGENTS.md');
    };
    expect(await named(undefined)).toBe(false);
    expect(await named(null)).toBe(false);
    expect(await named({ demo: 3 })).toBe(false);
    expect(await named('./dist/cli.js')).toBe(true);
  });
});
