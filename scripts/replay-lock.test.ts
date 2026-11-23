/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the replay cases are runnable, and the history only grows.
 *
 * `replay run` (.sdlc/intents/replay/) is a monthly, paid run: a case that does not parse, or a
 * config that names a stage the reviewer never reports, is found then, after the money is spent.
 * So every case and the config are read here on every push, the test set holds bugs and controls
 * both, and the history (replay spec R6) is held to what the last run wrote: one JSON report per
 * line, dated, never rewritten.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { parseCase, selectCases } from '../packages/replay/src/cases.js';
// eslint-disable-next-line import-next/no-relative-packages -- as above
import { CASES, HISTORY } from '../packages/replay/src/cli.js';
// eslint-disable-next-line import-next/no-relative-packages -- as above
import { CONFIG, parseConfig } from '../packages/replay/src/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('the replay cases', () => {
  const dir = join(ROOT, CASES);
  const cases = readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => ({ name, found: parseCase(`${CASES}/${name}`, readFileSync(join(dir, name), 'utf8')) }));

  it('each parse, are named by their id, and are distinct', () => {
    for (const { name, found } of cases) expect(name, 'fix: name the file <id>.yaml').toBe(`${found.id}.yaml`);
    expect(() => selectCases(cases.map(({ found }) => found), undefined)).not.toThrow();
  });

  it('hold a bug and a control in each set, so neither score is of one kind', () => {
    for (const set of ['tune', 'test'] as const) {
      const kinds = new Set(cases.filter(({ found }) => found.set === set).map(({ found }) => found.kind));
      expect([...kinds].sort(), `the ${set} set`).toEqual(['bug', 'control']);
    }
  });

  it('have answer keys a person wrote, not the draft placeholder', () => {
    expect(cases.filter(({ found }) => found.answer?.startsWith('TODO') === true).map(({ name }) => name)).toEqual([]);
  });

  it('run through a config that parses', () => {
    expect(() => parseConfig(CONFIG, readFileSync(join(ROOT, CONFIG), 'utf8'))).not.toThrow();
  });
});

describe('the replay history', () => {
  const file = join(ROOT, HISTORY);
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line !== '') : [];

  it('is one dated report per line, in date order', () => {
    const dates = lines.map((line) => (JSON.parse(line) as { date: string; report: unknown }).date);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates).toEqual(dates.toSorted());
  });
});
