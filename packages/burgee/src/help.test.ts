/**
 * cli-help-renderer — every row of the intent's table has a case here, on one fixture
 * program that uses every help field, at the widths the design names (60, 80, 100, 120).
 */
import { describe, expect, it } from 'vitest';

import { runCommand } from './execute.js';
import { globalRows } from './globals.js';
import { renderHelp } from './help-entry.js';
import { defineCommand, defineProgram } from './index.js';
import { type CommandNode } from './manifest.js';
import { completionNode, exitRows, rootExamples } from './root-help.js';
import { runBurgee } from './testing.js';
import { listed } from './usage.js';

const ok = (): string => 'ok';

const program = defineProgram({
  name: 'app',
  description: 'A fixture with every kind of help data.',
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
program.add({ path: ['app', 'old'], description: 'Legacy', deprecated: true, options: {}, run: ok });

const deploy = program.find(['app', 'deploy']) ?? program.commands[0];
const root = program.find(['app']) ?? program.commands[0];
if (deploy === undefined || root === undefined) throw new Error('fixture');
const WIDTHS = [60, 80, 100, 120];

/** A two-column row: indented, not an example line. */
const isRow = (l: string): boolean => /^ {2}\S/.test(l) && !l.startsWith('  $');

const found = (column: number): boolean => column !== -1;
const quiet = { write: (): boolean => true };
function ignoreExit(): undefined {
  return undefined;
}
const noExit = ignoreExit as unknown as (code: number) => never;

/** Column where a two-column row's description starts: the first double space after the indent. */
function descriptionStart(line: string): number {
  const gap = line.slice(2).search(/ {2}\S/);
  return gap === -1 ? -1 : 2 + gap + 2;
}

describe('help is rendered from the manifest (H1)', () => {
  it('lists every section in the fixed order, empty ones omitted (R2)', () => {
    const text = renderHelp(program, deploy, { width: 100 });
    const order = ['Usage:', 'Arguments:', 'Options:', 'Global options:', 'Examples:', 'Environment:', 'Deploys are logged'];
    const positions = order.map((s) => text.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).not.toContain('Commands:');
  });

  it('groups commands under headings and lists them bare, with the summary (yargs #684, #1964, #1265)', () => {
    const text = renderHelp(program, root, { width: 100 });
    // Bare of the program's name, not of what the command takes: `deploy <target> [files...]`,
    // the way commander lists `deploy [options] <target>`, so the line to run is on the screen.
    expect(text).toMatch(/Release commands:\n {2}deploy <target> \[files\.\.\.\] +Ship a build\n {2}status +Show status/);
    expect(text).toMatch(/Commands:\n {2}login +Sign in/);
    expect(text).not.toMatch(/app deploy/);
    expect(text).toMatch(/Usage: app <command> \[options\]/);
  });

  // The engine passes `commands` (every command that runs, when they fit) so the root's help names
  // `release cut <version>`, not `release`: B1's agents spent a turn on `config --help` without it.
  it('lists the commands it is given by their path from the node, under their top-level ancestor’s heading', () => {
    const nested = defineProgram({
      name: 'app',
      commands: [
        defineCommand({ name: 'release', group: 'Release commands:', commands: [defineCommand({ name: 'cut', description: 'Cut one', effects: 'withheld', arguments: [{ name: 'version', required: true }], run: ok })] }),
        defineCommand({ name: 'login', description: 'Sign in', effects: 'withheld', run: ok }),
      ],
    });
    const top = { path: ['app'], options: {} };
    const leaves = nested.commands.filter((c) => c.run !== undefined);
    expect(renderHelp(nested, top, { commands: leaves })).toMatch(/Release commands:\n {2}release cut <version> +Cut one\n\nCommands:\n {2}login +Sign in\n/);
    // Without `commands`, the node's own children, as before.
    expect(renderHelp(nested, top)).toMatch(/Release commands:\n {2}release\n\nCommands:\n {2}login +Sign in\n/);
    // A command reached through no declared node lists under the default heading.
    expect(renderHelp(nested, top, { commands: [{ path: ['app', 'ghost', 'run'], options: {} }] })).toMatch(/Commands:\n {2}ghost run\n/);
  });

  it('hides hidden commands and options, and marks deprecated ones inline (yargs #2248)', () => {
    expect(renderHelp(program, root)).not.toContain('hush');
    expect(renderHelp(program, root)).toMatch(/old +Legacy \(deprecated\)/);
    const text = renderHelp(program, deploy);
    expect(text).not.toContain('secret');
    expect(text).toMatch(/--legacy +old flag \(deprecated: use --force\)/);
  });

  it('keeps type hints off unless verbose (H6, yargs #969, #427)', () => {
    expect(renderHelp(program, deploy)).not.toMatch(/\[string\]|\[boolean\]/);
    expect(renderHelp(program, deploy, { verbose: true })).toMatch(/--region <code> +the region \(default: eu\) \(one of: eu, us\) \[env: APP_REGION\] \[string\]/);
  });

  it('annotates defaults, choices, env and placeholder in a stable order (R4, yargs #1408, #833, #1935)', () => {
    const text = renderHelp(program, deploy);
    expect(text).toMatch(/--region <code> +the region \(default: eu\) \(one of: eu, us\) \[env: APP_REGION\]/);
    expect(text).toMatch(/-f, --force +skip the confirmation/);
    expect(text).toMatch(/Environment:\n {2}APP_REGION +--region/);
  });

  it('renders command options before global options (H4, yargs #1181)', () => {
    const text = renderHelp(program, deploy);
    expect(text.indexOf('--region')).toBeLessThan(text.indexOf('--json'));
    expect(text).toMatch(/Global options:\n {2}--json +machine-readable output\n {2}--help +show this help/);
  });

  it('documents positionals with their defaults in the same column (yargs #2012)', () => {
    const text = renderHelp(program, deploy);
    expect(text).toMatch(/Usage: deploy \[options\] <target> \[files\.\.\.\]/);
    expect(text).toMatch(/Arguments:\n {2}<target> +where to ship\n {2}\[files\.\.\.\] +extra files \(default: none\)/);
  });

  it('puts each example on one copy-pasteable line, description below (H2, R5, yargs #877)', () => {
    const text = renderHelp(program, deploy);
    expect(text).toMatch(/Examples:\n {2}\$ app deploy prod --region us\n {4}Ship to production/);
    expect(text).toMatch(/\n {2}\$ app deploy staging\n/);
  });

  it.each(WIDTHS)('fits %d columns with no term wrapped and one aligned description column (R3, H3, yargs #2204)', (width) => {
    for (const node of [root, deploy]) {
      const text = renderHelp(program, node, { width });
      const lines = text.split('\n');
      expect(lines.every((l) => l.length <= width)).toBe(true);
      // every two-column row starts its description at the same column
      const starts = new Set(lines.filter(isRow).map(descriptionStart).filter(found));
      expect(starts.size).toBe(1);
    }
  });

  it('keeps an author-indented description verbatim (yargs #2120)', () => {
    const node = { path: ['app', 'x'], options: {}, description: 'First line\n  indented detail that must not be re-wrapped at all costs whatever the width may be' };
    expect(renderHelp(program, node, { width: 40 })).toContain('\n  indented detail that must not be re-wrapped at all costs whatever the width may be\n');
  });
});

describe('help through the engine', () => {
  it('--help on a command, help <command>, and the root all render from the same renderer', async () => {
    const a = await runBurgee(program, { argv: ['deploy', '--help'] });
    const b = await runBurgee(program, { argv: ['help', 'deploy'] });
    expect(a.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stdout).toBe(renderHelp(program, deploy, { width: 100, globals: globalRows(deploy) }));
    const r = await runBurgee(program, { argv: ['help'] });
    // The engine lists the commands that run, then its own `completion` and the exit codes, and
    // shows the root's examples (agent-lint-conformance R4–R6).
    const commands = [...listed(program, root), completionNode(program) as CommandNode, ...exitRows(program)];
    expect(r.stdout).toBe(renderHelp(program, { ...root, examples: rootExamples(program, root) }, { width: 100, commands, globals: globalRows(root) }));
  });

  it('takes its width from the injected stdout when it has columns (H3)', async () => {
    const out: string[] = [];
    const { execute } = await import('./index.js');
    await execute(program, { argv: ['deploy', '--help'], stdout: { write: (s: string) => out.push(s), columns: 60 }, stderr: quiet, exit: noExit });
    expect(out.join('')).toBe(renderHelp(program, deploy, { width: 60, globals: globalRows(deploy) }));
  });
});

describe('theme seam (R7; roundel used without being imported)', () => {
  const ESC = String.fromCharCode(27);
  const wrapIn =
    (open: string, close: string) =>
    (s: string): string =>
      `${ESC}[${open}m${s}${ESC}[${close}m`;
  /** A theme shaped like roundel's R3 tokens; nothing here imports roundel. */
  const theme = { heading: wrapIn('4', '24'), command: wrapIn('35', '39'), flag: wrapIn('32', '39'), value: wrapIn('33', '39'), error: wrapIn('31', '39') };
  const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

  it('is byte-identical with and without a theme when colour is off, which is the default', () => {
    for (const node of [root, deploy]) {
      const plain = renderHelp(program, node, { width: 100 });
      expect(renderHelp(program, node, { width: 100, theme })).toBe(plain);
      expect(renderHelp(program, node, { width: 100, color: false, theme })).toBe(plain);
      expect(plain).not.toMatch(ANSI);
    }
  });

  it('with colour on and a theme, differs from plain only in ANSI, and every line still fits the width', () => {
    for (const width of WIDTHS) {
      for (const node of [root, deploy]) {
        const plain = renderHelp(program, node, { width });
        const themed = renderHelp(program, node, { width, color: true, theme });
        expect(themed).not.toBe(plain);
        expect(themed.replace(ANSI, '')).toBe(plain);
        expect(themed.split('\n').every((l) => l.replace(ANSI, '').length <= width)).toBe(true);
      }
    }
  });

  it('a provided token replaces the default; an omitted one keeps it', () => {
    const themed = renderHelp(program, root, { width: 100, color: true, theme: { command: wrapIn('35', '39') } });
    expect(themed).toContain(`${ESC}[35mdeploy <target> [files...]${ESC}[39m`);
    // heading fell back to the default (bold), so the section title is still styled
    expect(themed).toContain(`${ESC}[1mRelease commands:${ESC}[22m`);
    const defaults = renderHelp(program, deploy, { width: 100, color: true });
    expect(defaults.replace(ANSI, '')).toBe(renderHelp(program, deploy, { width: 100 }));
    expect(defaults).toMatch(ANSI);
  });

  it('never colours a name in the manifest: colour wraps the rendered cell after it is measured (yargs #1699)', () => {
    const before = JSON.stringify(program.commands.map((c) => c.path));
    const themed = renderHelp(program, root, { width: 100, color: true, theme });
    expect(JSON.stringify(program.commands.map((c) => c.path))).toBe(before);
    // the coloured term is padded to the same column as the plain one
    expect(themed).toMatch(new RegExp(`\\n {2}${ESC}\\[35mdeploy <target> \\[files\\.\\.\\.\\]${ESC}\\[39m +Ship a build\\n`));
    expect(themed.replace(ANSI, '')).toMatch(/\n {2}deploy <target> \[files\.\.\.\] +Ship a build\n/);
  });

  // This case once read "the engine still renders help plain: no colour decision was added
  // to it" — the guard that kept the theme seam byte-identical when it landed. O2 then asked
  // for exactly that decision, so the invariant it protected is what remains: the engine's
  // colour adds ANSI and nothing else, and NO_COLOR gives back the plain render byte for byte.
  it('the engine colours help by O2 alone: ANSI is all it adds, and NO_COLOR removes it', async () => {
    // A terminal that names itself: with no `TERM` and nothing asked, roundel's policy is plain.
    const coloured = await runBurgee(program, { argv: ['deploy', '--help'], tty: true, env: { TERM: 'xterm-256color' } });
    expect(coloured.stdout).toMatch(ANSI);
    expect(coloured.stdout.replace(ANSI, '')).toBe(renderHelp(program, deploy, { width: 100, globals: globalRows(deploy) }));
    const plain = await runBurgee(program, { argv: ['deploy', '--help'], tty: true, env: { TERM: 'xterm-256color', NO_COLOR: '1' } });
    expect(plain.stdout).toBe(renderHelp(program, deploy, { width: 100, globals: globalRows(deploy) }));
  });
});

interface Inventory {
  sections: [string, string[]][];
  examples: string[];
}
/** The terminal screen read back: each heading, the terms under it, and every `$ example`. */
const fromText = (text: string): Inventory => {
  const out: Inventory = { sections: [], examples: [] };
  for (const l of text.split('\n')) {
    if (/^[A-Z][^:]*:$/.test(l)) out.sections.push([l, []]);
    else if (l.startsWith('  $ ')) out.examples.push(l.slice(4));
    else if (/^ {2}\S/.test(l)) out.sections.at(-1)?.[1].push(l.trim().split(/ {2,}/)[0] as string);
  }
  return { ...out, sections: out.sections.filter(([t]) => t !== 'Examples:') };
};
/** The Markdown read back the same way: `## Heading`, a table row's first cell, a fenced line. */
const fromMarkdown = (md: string): Inventory => {
  const out: Inventory = { sections: [], examples: [] };
  let fenced = false;
  let heading = '';
  for (const l of md.split('\n')) {
    if (l.startsWith('```')) fenced = !fenced;
    else if (fenced && heading === 'Examples:') out.examples.push(l);
    else if (l.startsWith('## ')) out.sections.push([(heading = `${l.slice(3)}:`), []]);
    else if (l.startsWith('| `')) {
      const term = /^\| `([^`]*)`/u.exec(l)?.[1];
      if (term === undefined) throw new Error(`a table row with no term: ${l}`);
      out.sections.at(-1)?.[1].push(term);
    }
  }
  return { ...out, sections: out.sections.filter(([t]) => t !== 'Examples:' && t !== 'Usage:') };
};

/**
 * agent-skill R1 — help as Markdown is a second layout of the same section list, so the two
 * targets cannot list different things. Held on the demo's shape, at the root as the engine hands
 * it over (its `completion`, the exit codes, the commands' first examples) and at every command.
 */
describe('help renders as Markdown, from the same sections (agent-skill R1)', () => {
  const demo = defineProgram({
    name: 'demo',
    description: 'The burgee reference demo',
    commands: [
      defineCommand({
        name: 'greet',
        description: 'Greet someone',
        effects: 'read_only',
        arguments: [{ name: 'name', description: 'who to greet', required: true }],
        examples: [{ command: 'demo greet ada --shout', description: 'greet ada, loudly' }],
        options: {
          shout: { type: 'boolean', description: 'uppercase the greeting' },
          greeting: { type: 'string', description: 'the greeting word', env: 'DEMO_GREETING', default: 'Hello' },
        },
        run: ok,
      }),
      defineCommand({
        name: 'config',
        description: 'Read configuration',
        commands: [defineCommand({ name: 'get', description: 'Print one configuration value', effects: 'read_only', arguments: [{ name: 'key', description: 'dotted key', required: true }], examples: [{ command: 'demo config get user.name --json', description: 'one value, as the --json envelope' }], run: ok })],
      }),
      defineCommand({ name: 'fail', description: 'Fail on purpose | on cue', effects: 'idempotent', options: { code: { type: 'string', description: 'exit with this E1 code' } }, examples: [{ command: 'demo fail --code 3' }], run: ok }),
    ],
  });
  const at = (path: string[]): CommandNode => demo.find(path) as CommandNode;
  const top = at(['demo']);
  /** What `surfaces.ts` hands the renderer at the root, and at a command. */
  const engine = (n: CommandNode): { node: CommandNode; opts: { commands: CommandNode[]; globals: { term: string; text: string }[] } } => {
    const atRoot = n.path.length === 1;
    const commands = [...listed(demo, n), ...(atRoot ? [completionNode(demo) as CommandNode, ...exitRows(demo)] : [])];
    return { node: atRoot ? { ...n, examples: rootExamples(demo, n) } : n, opts: { commands, globals: globalRows(n) } };
  };

  for (const path of [['demo'], ['demo', 'greet'], ['demo', 'config'], ['demo', 'config', 'get'], ['demo', 'fail']]) {
    it(`${path.join(' ')}: the Markdown lists the commands, options and examples the screen does`, async () => {
      const { node, opts } = engine(at(path));
      const text = renderHelp(demo, node, { width: 100, ...opts });
      const md = await renderHelp(demo, node, { ...opts, format: 'markdown' });
      expect(fromMarkdown(md)).toEqual(fromText(text));
      expect(fromText(text).sections.length).toBeGreaterThan(0);
      expect(md.startsWith(`# ${path.join(' ')}\n`)).toBe(true);
    });
  }

  it('lays out a heading, a usage block, tables and fenced examples, with the exit-code table at the root', async () => {
    const { node, opts } = engine(top);
    const md = await renderHelp(demo, node, { ...opts, format: 'markdown' });
    expect(md).toContain('## Usage\n\n```sh\ndemo <command> [options]\n```\n');
    expect(md).toContain('## Exit codes\n\n| Term | Description |\n| :-- | :-- |\n| `0` | ok: the command completed |\n');
    expect(md).toContain('| `fail` | Fail on purpose \\| on cue |');
    expect(md).toContain('greet ada, loudly\n\n```sh\ndemo greet ada --shout\n```\n');
    expect(md).toContain('\nFor agents: --schema');
    expect(md.endsWith('\n') && !md.endsWith('\n\n')).toBe(true);
  });

  it('a mutation that drops a section from one target is caught', async () => {
    const { node, opts } = engine(at(['demo', 'greet']));
    const text = renderHelp(demo, node, { width: 100, ...opts });
    const md = await renderHelp(demo, node, { ...opts, format: 'markdown' });
    const dropped = md.replace(/## Options\n[\s\S]*?\n\n(?=## )/u, '');
    expect(dropped).not.toBe(md);
    expect(fromMarkdown(dropped)).not.toEqual(fromText(text));
    const droppedText = text.replace(/Global options:\n[\s\S]*?\n\n/u, '');
    expect(fromMarkdown(md)).not.toEqual(fromText(droppedText));
  });

  it('a group heading with no colon keeps its last letter, and a term with a backtick stays one code span', async () => {
    const odd = defineProgram({ name: 'app', commands: [defineCommand({ name: 'ship', group: 'Release', description: 'Ship it', effects: 'withheld', run: ok })] });
    const md = await renderHelp(odd, odd.find(['app']) as CommandNode, { format: 'markdown', globals: [{ term: '--tick `x`', text: 'odd' }] });
    expect(md).toContain('\n## Release\n');
    expect(md).toContain('| `` --tick `x` `` | odd |');
  });

  it('a description over two lines keeps one table row per option', async () => {
    const two = defineProgram({ name: 'app', commands: [defineCommand({ name: 'go', effects: 'read_only', options: { far: { type: 'boolean', description: 'first line\nsecond line' }, near: { type: 'boolean', description: 'one' } }, run: ok })] });
    const md = await renderHelp(two, two.find(['app', 'go']) as CommandNode, { format: 'markdown' });
    const options = md.slice(md.indexOf('## Options'), md.indexOf('## Global options')).split('\n').filter((l) => l.startsWith('| `'));
    expect(options).toEqual(['| `--far` | first line<br>second line |', '| `--near` | one |']);
  });

  it('a node with nothing but a name is a heading and a usage block', async () => {
    const bare = defineProgram({ name: 'app', commands: [defineCommand({ name: 'ping', effects: 'read_only', run: ok })] });
    const ping = bare.find(['app', 'ping']) as CommandNode;
    expect(await renderHelp(bare, ping, { format: 'markdown' })).toBe(
      '# app ping\n\n## Usage\n\n```sh\napp ping [options]\n```\n\n## Global options\n\n| Term | Description |\n| :-- | :-- |\n| `--json` | machine-readable output |\n| `--help` | show this help |\n| `--explain <option>` | where an option\'s value came from |\n',
    );
  });
});

/**
 * `localised-human-surfaces` R5 — an author localises their own text: `description`, `summary`,
 * an example's description and an option's description take `string | Record<locale, string>`,
 * the first entry being the author's base language, and help renders the run's locale.
 */
describe('a localised description renders in the resolved locale (R5)', () => {
  const tool = defineProgram({
    name: 'tool',
    description: { en: 'A tool', de: 'Ein Werkzeug' },
    commands: [
      defineCommand({
        name: 'deploy',
        description: { en: 'Deploy the site', de: 'Die Seite bereitstellen', 'de-AT': 'Die Seite ausrollen' },
        summary: { en: 'deploy it', de: 'bereitstellen' },
        effects: 'non_idempotent',
        examples: [{ command: 'tool deploy --dry-run', description: { en: 'look first', de: 'erst schauen' } }],
        options: { dryRun: { type: 'boolean', description: { en: 'change nothing', de: 'nichts ändern' } }, force: { type: 'boolean', description: 'push anyway' } },
        run: () => 'ok',
      }),
    ],
  });
  const help = async (argv: string[], env: Record<string, string>): Promise<string> => (await runCommand(tool, argv, { env })).stdout;

  it('in the base language when no locale is resolved, byte for byte what a string would render', async () => {
    const plain = defineProgram({
      name: 'tool',
      description: 'A tool',
      commands: [
        defineCommand({
          name: 'deploy',
          description: 'Deploy the site',
          summary: 'deploy it',
          effects: 'non_idempotent',
          examples: [{ command: 'tool deploy --dry-run', description: 'look first' }],
          options: { dryRun: { type: 'boolean', description: 'change nothing' }, force: { type: 'boolean', description: 'push anyway' } },
          run: () => 'ok',
        }),
      ],
    });
    const lines = [['--help'], ['deploy', '--help']];
    const [localisedHelp, plainHelp] = await Promise.all([Promise.all(lines.map((argv) => help(argv, { LANG: 'C' }))), Promise.all(lines.map(async (argv) => (await runCommand(plain, argv, { env: { LANG: 'C' } })).stdout))]);
    expect(localisedHelp).toEqual(plainHelp);
  });

  it('in German under LANG=de_DE.UTF-8: description, summary, option and example', async () => {
    const root = await help(['--help'], { LANG: 'de_DE.UTF-8' });
    expect(root).toContain('Ein Werkzeug');
    expect(root).toMatch(/deploy\s+bereitstellen/u);
    const deploy = await help(['deploy', '--help'], { LANG: 'de_DE.UTF-8' });
    expect(deploy).toContain('Die Seite bereitstellen');
    expect(deploy).toMatch(/--dry-run\s+nichts ändern/u);
    expect(deploy).toMatch(/--force\s+push anyway/u);
    expect(deploy).toContain('    erst schauen');
  });

  it('takes the region’s own text over the language’s, and the base language for one it lacks', async () => {
    expect(await help(['deploy', '--help'], { LANG: 'de_AT.UTF-8' })).toContain('Die Seite ausrollen');
    expect(await help(['deploy', '--help'], { LANG: 'fr_FR.UTF-8' })).toContain('Deploy the site');
  });

  it('--skill renders the author’s text in the run’s locale too, and the base language without one', async () => {
    const german = await help(['--skill'], { LANG: 'de_DE.UTF-8' });
    expect(german).toContain('Ein Werkzeug.');
    expect(german).toContain('`tool deploy`: bereitstellen.');
    const base = await help(['--skill'], { LANG: 'C' });
    expect(base).toContain('A tool.');
    expect(base).toContain('`tool deploy`: deploy it.');
    expect(base).not.toMatch(/Werkzeug|bereitstellen/u);
  });

  it('follows the program’s locale option, and ignores LANG for a detected agent', async () => {
    expect((await runCommand(tool, ['deploy', '--help'], { env: { LANG: 'C' }, locale: 'de' })).stdout).toContain('Die Seite bereitstellen');
    expect(await help(['deploy', '--help'], { LANG: 'de_DE.UTF-8', CLAUDECODE: '1' })).toContain('Deploy the site');
  });
});
