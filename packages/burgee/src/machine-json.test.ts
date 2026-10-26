/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `agent-headroom` R1. The saving is real but invisible — a compact document and a pretty
 * one parse to the same value, so nothing an ordinary test asserts changes when the
 * whitespace comes back. That is the whole reason this file and the `agent-schema-bytes`
 * band both exist: the property being defended is the *size of the string*, and only a
 * test that measures the string can defend it.
 */
import { describe, expect, it } from 'vitest';

import { Command } from './commander.js';
import { defineCommand, defineProgram } from './index.js';
import { machineJson } from './schema.js';
import { runBurgee } from './testing.js';
import yargs, { type Argv } from './yargs.js';

const JSON_PRETTY = '--format=json-pretty';

const doc = { ok: true, commands: [{ name: 'greet', args: ['who'] }, { name: 'config' }], nested: { a: { b: { c: 1 } } } };

describe('machineJson', () => {
  it('emits no insignificant whitespace by default', () => {
    const out = machineJson(doc, []);
    expect(out).toBe(JSON.stringify(doc));
    expect(out).not.toContain('\n');
    expect(out).not.toContain(': ');
  });

  it('indents when a person asks', () => {
    expect(machineJson(doc, [JSON_PRETTY])).toBe(JSON.stringify(doc, null, 2));
  });

  it('the two parse to the same value — which is why bytes, not shape, is the assertion', () => {
    expect(JSON.parse(machineJson(doc, []))).toEqual(JSON.parse(machineJson(doc, [JSON_PRETTY])));
  });

  it('is smaller by the margin the design measured', () => {
    const compact = machineJson(doc, []).length;
    const pretty = machineJson(doc, [JSON_PRETTY]).length;
    expect(compact).toBeLessThan(pretty);
    // The design's figure is 42% on the large reference demo; the ratio here is this
    // fixture's, and the assertion is only that indentation is a large fraction and not a
    // rounding error. `benchmarks/axes/reliability.ts` measures the real document.
    expect(1 - compact / pretty).toBeGreaterThan(0.3);
  });

  // The flag has to be an exact match: a program's own `--format` value must not be read as
  // a request to indent burgee's schema.
  it.each([['--format=json'], ['--format=json-pretty-please'], ['--format'], ['json-pretty']])('%j does not turn on indentation', (flag) => {
    expect(machineJson(doc, [flag])).toBe(JSON.stringify(doc));
  });

  it('finds the flag wherever it sits in the head', () => {
    expect(machineJson(doc, ['--schema', JSON_PRETTY])).toContain('\n');
    expect(machineJson(doc, [JSON_PRETTY, '--schema'])).toContain('\n');
  });
});

/**
 * The end-to-end half. `machineJson` being correct is not the property that matters — what
 * matters is that the bytes leaving `--schema` are the compact ones, and a helper can be
 * perfect while a call site still passes `null, 2`. Both call sites are exercised, because
 * the commander front-end has its own.
 */
describe('--schema emits the compact document', () => {
  const program = defineProgram({
    name: 'app',
    version: '1.0.0',
    commands: [
      defineCommand({ name: 'greet', description: 'Greet someone', options: { who: { type: 'string', required: true } }, effects: 'withheld', run: () => 'hi' }),
      defineCommand({ name: 'deploy', description: 'Ship a build', options: { target: { type: 'string', required: true } }, effects: 'withheld', run: () => 'ok' }),
    ],
  });

  it('writes no newline but the trailing one, and no indentation', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    expect(r.stdout.endsWith('\n')).toBe(true);
    expect(r.stdout.slice(0, -1)).not.toContain('\n');
  });

  it('is smaller than the pretty form, and the two parse alike', async () => {
    const compact = await runBurgee(program, { argv: ['--schema'] });
    const pretty = await runBurgee(program, { argv: ['--schema', '--format=json-pretty'] });
    expect(JSON.parse(compact.stdout)).toEqual(JSON.parse(pretty.stdout));
    expect(compact.stdout.length).toBeLessThan(pretty.stdout.length);
  });

  /**
   * `--format=json-pretty` is a flag, not a step in the command path. Before the filter in
   * `schemaSurface` learned that, drilling with the escape hatch on resolved `app deploy
   * --format=json-pretty` as a path of two segments and fell back to the whole program.
   */
  it('still drills into one command when the escape hatch is on', async () => {
    // The flag ahead of the command is the case that discriminates: `resolve` matches
    // command segments from the front of argv, so an unfiltered flag at index 0 matches no
    // command and the drill silently becomes the whole program.
    const r = await runBurgee(program, { argv: ['--format=json-pretty', 'deploy', '--schema'] });
    expect(JSON.parse(r.stdout)).toMatchObject({ name: 'deploy' });
  });
});

/**
 * The commander front-end has its own `--schema` writer, so it can revert on its own. It
 * did not share a call site with the engine before this change and still does not — it
 * shares the helper, which is what makes one test per writer the honest number.
 */
const runCommander = (argv: string[]): string => {
  const out: string[] = [];
  const program = new Command('tool');
  program.configureOutput({ writeOut: (s: string) => void out.push(s) });
  program.command('info').description('Show info').action(() => undefined);
  program.parse(['node', 'test', ...argv]);
  return out.join('');
};

describe('the commander front-end emits the compact document too', () => {
  it('writes no indentation by default', () => {
    const compact = runCommander(['--schema']);
    expect(compact.slice(0, -1)).not.toContain('\n');
    expect(JSON.parse(compact)).toMatchObject({ name: 'tool' });
  });

  it('indents when a person asks, for the same document', () => {
    const compact = runCommander(['--schema']);
    const pretty = runCommander(['--schema', '--format=json-pretty']);
    expect(JSON.parse(compact)).toEqual(JSON.parse(pretty));
    expect(compact.length).toBeLessThan(pretty.length);
  });
});

/**
 * The claim the two suites above cannot make between them.
 *
 * Each of those is true of one writer in isolation, and a writer can be perfectly
 * consistent with itself while disagreeing with its siblings. `--schema` is *burgee's*
 * surface rather than any host's (F1): the same CLI, declared three ways and driven through
 * the engine, the commander façade and the yargs façade, has to hand an agent the same
 * bytes — otherwise "burgee's agent surface" is three surfaces, and a reader has to know
 * which front-end produced the document before it can know what it is holding.
 *
 * That is the state this test was written against. `yargs/factory.ts` spelled
 * `JSON.stringify(schemaOf(…), null, 2)` by hand where `execute.ts` and
 * `commander/command.ts` both called `machineJson(value, head)`, so the yargs façade could
 * not see `--format=json-pretty` at all: it emitted the indented document always, and a
 * plain `--schema` on a yargs-shaped CLI was 365 bytes where the other two wrote 240.
 *
 * Byte equality rather than `toEqual` on the parse is the assertion on purpose — a compact
 * document and a pretty one parse alike, which is exactly why the divergence survived every
 * other test in this package.
 */
const defined = defineProgram({
  name: 'tool',
  version: '1.0.0',
  commands: [defineCommand({ name: 'info', description: 'Show info', effects: 'withheld', run: () => undefined })],
});

const throughEngine = async (argv: string[]): Promise<string> => (await runBurgee(defined, { argv })).stdout;

const throughCommander = (argv: string[]): string => {
  const out: string[] = [];
  const program = new Command('tool');
  program.version('1.0.0');
  program.configureOutput({ writeOut: (s: string) => void out.push(s) });
  program.command('info').description('Show info').effects('withheld').action(() => undefined);
  program.parse(['node', 'test', ...argv]);
  return out.join('');
};

const throughYargs = async (argv: string[]): Promise<string> => {
  const out: string[] = [];
  await yargs([])
    .scriptName('tool')
    .version('1.0.0')
    .burgee({ stdout: { write: (s: string) => void out.push(s) }, stderr: { write: () => undefined }, exit: () => undefined })
    .command('info', 'Show info', (cmd: Argv) => cmd.effects('withheld'), () => undefined)
    .parseAsync(argv);
  return out.join('');
};

const frontEnds: [string, (argv: string[]) => string | Promise<string>][] = [
  ['the engine', throughEngine],
  ['the commander façade', throughCommander],
  ['the yargs façade', throughYargs],
];

/**
 * The engine's document, re-written without `explain`, in the same whitespace. `explain` names
 * `--explain`, which only the engine parses (D-20261009-b1-totals-and-explain): a façade that
 * carried it would advertise a flag it refuses. Every other byte is the same document, and the
 * re-writing keeps key order, so the comparison below is still byte for byte.
 */
//
// The same holds for the last command row, `completion` (agent-lint-conformance R5): the engine
// publishes the command it synthesises, and the façades' documents stay the bytes they were.
/**
 * The engine's document less what only the native surface adds: `explain`, the `completion` it
 * serves, and the clispec keys (clispec-conformance), which ride the lazy `--schema` chunk the
 * façades do not load.
 */
const withoutExplain = (out: string, pretty: boolean): string => {
  const { explain, errors, clispec, global_args: globalArgs, output, ...rest } = JSON.parse(out) as Record<string, unknown> & { commands: Record<string, unknown>[] };
  expect(explain).toMatch(/^--explain <option>/);
  expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'usage' })]));
  expect([clispec, globalArgs, output]).toEqual(['0.3', expect.any(Array), expect.objectContaining({ piped: 'text' })]);
  // A command's own clispec keys (R4, R5) are the native surface's too.
  rest.commands = rest.commands.map(({ example: _e, output_kind: _k, media_type: _m, cardinality: _c, stdout_schema: _s, ...command }) => command);
  expect(rest.commands.pop()?.name).toBe('completion');
  return `${JSON.stringify(rest, null, pretty ? 2 : 0)}\n`;
};

describe('the three front ends emit the same document', () => {
  it('agrees byte for byte on the compact document', async () => {
    const argv = ['--schema'];
    const engine = withoutExplain(await throughEngine(argv), false);
    expect(throughCommander(argv)).toBe(engine);
    expect(await throughYargs(argv)).toBe(engine);
  });

  it('agrees byte for byte on the readable one', async () => {
    const argv = ['--schema', JSON_PRETTY];
    const engine = withoutExplain(await throughEngine(argv), true);
    expect(throughCommander(argv)).toBe(engine);
    expect(await throughYargs(argv)).toBe(engine);
  });

  it('only the engine names --explain, the one front end that parses it', async () => {
    const argv = ['--schema'];
    expect(JSON.parse(await throughEngine(argv))).toHaveProperty('explain');
    expect(JSON.parse(throughCommander(argv))).not.toHaveProperty('explain');
    expect(JSON.parse(await throughYargs(argv))).not.toHaveProperty('explain');
  });

  it.each(frontEnds)('%s indents only when asked, and ends in one newline either way', async (_name, run) => {
    const compact = await run(['--schema']);
    const pretty = await run(['--schema', JSON_PRETTY]);
    expect(compact.endsWith('\n')).toBe(true);
    expect(pretty.endsWith('\n')).toBe(true);
    expect(compact.slice(0, -1)).not.toContain('\n');
    expect(pretty).toContain('\n  ');
    expect(JSON.parse(compact)).toEqual(JSON.parse(pretty));
    expect(compact.length).toBeLessThan(pretty.length);
  });
});

/**
 * clispec-conformance R7 — an explicit human format wins whatever the TTY or an agent's
 * environment says: `--format text` (and `--format=text`, `--output text`) runs the command as
 * typed without it, and prints what it prints by default, which is text. `--schema` says so in
 * `output`. Red before R7: `unknown option --format`, exit 2.
 */
describe('--format text is the human rendering, asked for (R7)', () => {
  const program = defineProgram({
    name: 'app',
    commands: [
      defineCommand({ name: 'greet', effects: 'read_only', arguments: [{ name: 'who', required: true }], run: ({ positionals }) => ({ hello: positionals[0] }) }),
      defineCommand({ name: 'own', effects: 'read_only', options: { format: { type: 'string' } }, run: ({ options }) => `own ${String(options['format'])}` }),
      defineCommand({ name: 'near', effects: 'read_only', options: { formats: { type: 'string' } }, run: () => 'near' }),
    ],
  });
  const text = 'hello: ada\n';

  it.each([
    [['greet', 'ada', '--format', 'text']],
    [['greet', 'ada', '--format=text']],
    [['greet', 'ada', '--output', 'text']],
    [['--format', 'text', 'greet', 'ada']],
  ])('%j prints the human rendering under a pipe, exit 0', async (argv) => {
    const plain = await runBurgee(program, { argv: ['greet', 'ada'] });
    const r = await runBurgee(program, { argv });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(plain.stdout);
    expect(r.stdout).toBe(text);
  });

  it('wins over an agent’s environment too', async () => {
    const r = await runBurgee(program, { argv: ['greet', 'ada', '--format', 'text'], env: { CLAUDECODE: '1' } });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(text);
  });

  it('leaves a command’s own --format to it, and refuses one that is a guess', async () => {
    expect((await runBurgee(program, { argv: ['own', '--format', 'text'] })).stdout).toBe('own text\n');
    const near = await runBurgee(program, { argv: ['near', '--format', 'text'] });
    expect(near.code).toBe(2);
    expect(near.stderr).toMatch(/^error: unknown option --format\nhint: did you mean --formats\?/u);
  });

  it('is declared in --schema: text at a terminal and under a pipe, and the formats there are', async () => {
    const doc = JSON.parse((await runBurgee(program, { argv: ['--schema'] })).stdout) as Record<string, unknown>;
    expect(doc['output']).toEqual({ tty: 'text', piped: 'text', formats: ['text', 'json', 'agent', 'tsv'] });
  });
});

/**
 * `agent-headroom` C1 — the figure the intent opened on, held on the document it was measured
 * on. The cases above measure a fixture; the 42% the design quoted (39,512 → 22,964 B on
 * 2026-09-09) belongs to `examples/demo-cli-large`, and nothing checked it there until now.
 *
 * The demo is loaded from its source by a computed specifier: it is another workspace, outside
 * this package's `rootDir`, and its own `burgee` import is the built one — what is measured is
 * this source's `--schema` writer over the large demo's declarations.
 */
async function largeDemo(): Promise<Parameters<typeof runBurgee>[0]> {
  const at = new URL('../../../examples/demo-cli-large/src/index.ts', import.meta.url).href;
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- a fixed path to this repository's own demo, computed only to stay outside tsc's rootDir
  return ((await import(/* @vite-ignore */ at)) as { program: Parameters<typeof runBurgee>[0] }).program;
}

describe('the large demo’s --schema (C1)', () => {
  it('is at least 40% smaller compact than pretty, and the two parse to the same document', async () => {
    const program = await largeDemo();
    const compact = await runBurgee(program, { argv: ['--schema'] });
    const pretty = await runBurgee(program, { argv: ['--schema', JSON_PRETTY] });
    expect([compact.code, pretty.code]).toEqual([0, 0]);
    // Whole, not summarised: a summary is smaller for another reason, and would pass this for it.
    expect(JSON.parse(compact.stdout)).not.toHaveProperty('summarised');
    expect(JSON.parse(compact.stdout)).toEqual(JSON.parse(pretty.stdout));
    const bytes = { compact: Buffer.byteLength(compact.stdout), pretty: Buffer.byteLength(pretty.stdout) };
    // Measured 2026-10-25 at f6919e9c1a: 25,197 B compact against 42,783 B pretty, 41.1% smaller.
    // The bound is the intent's (C1), not the measurement: indentation came back if it fails.
    expect(1 - bytes.compact / bytes.pretty).toBeGreaterThanOrEqual(0.4);
  });
});
