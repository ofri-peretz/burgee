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
      defineCommand({ name: 'greet', description: 'Greet someone', options: { who: { type: 'string', required: true } }, run: () => 'hi' }),
      defineCommand({ name: 'deploy', description: 'Ship a build', options: { target: { type: 'string', required: true } }, run: () => 'ok' }),
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
