/**
 * cli-help-renderer — every row of the intent's table has a case here, on one fixture
 * program that uses every help field, at the widths the design names (60, 80, 100, 120).
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, renderHelp } from './index.js';
import { runBurgee } from './testing.js';

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
      run: ok,
    }),
    defineCommand({ name: 'status', description: 'Show status', group: 'Release commands:', run: ok }),
    defineCommand({ name: 'login', description: 'Sign in', run: ok }),
    defineCommand({ name: 'old', description: 'Legacy', deprecated: true, run: ok }),
    defineCommand({ name: 'hush', description: 'Never listed', hidden: true, run: ok }),
  ],
});

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
    expect(text).toMatch(/Release commands:\n {2}deploy +Ship a build\n {2}status +Show status/);
    expect(text).toMatch(/Commands:\n {2}login +Sign in/);
    expect(text).not.toMatch(/app deploy/);
    expect(text).toMatch(/Usage: app <command> \[options\]/);
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
    expect(a.stdout).toBe(renderHelp(program, deploy, { width: 100 }));
    const r = await runBurgee(program, { argv: ['help'] });
    expect(r.stdout).toBe(renderHelp(program, root, { width: 100 }));
  });

  it('takes its width from the injected stdout when it has columns (H3)', async () => {
    const out: string[] = [];
    const { execute } = await import('./index.js');
    await execute(program, { argv: ['deploy', '--help'], stdout: { write: (s: string) => out.push(s), columns: 60 }, stderr: quiet, exit: noExit });
    expect(out.join('')).toBe(renderHelp(program, deploy, { width: 60 }));
  });
});
