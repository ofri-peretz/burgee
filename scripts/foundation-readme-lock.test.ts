/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — each foundation README names the Node builtin it builds on, and its opening is its own.
 *
 * `cli-foundation-stack` Y4 and Y12, accepted at the 2026-10-25 design gate.
 *
 *   - **Y4.** Every foundation layer composes a builtin and adds what the builtin does not do.
 *     A reader deciding whether they need the package at all deserves the builtin's name, and
 *     so does the next maintainer: `scripts/absorption-probe.ts` asks each Node line whether that
 *     builtin has caught up. The README must name it.
 *   - **Y12.** PRINCIPLES 8: a package leads with its own incumbents, never with a sibling. The
 *     opening — the header block and the first paragraph after it — never names `burgee`. URLs
 *     are not prose: the repository is called burgee, and every badge links into it.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PROBES } from './absorption-probe';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The builtins each layer composes, as the design gate named them, spelled as a README would write them. */
const BUILTINS = {
  linegauge: ['Intl.Segmenter', 'util.stripVTControlCharacters'],
  seniority: ['process.loadEnvFile', 'util.parseEnv'],
  bellpull: ['node:child_process'],
  closeout: ['process.on(signal)'],
} as const;

type Layer = keyof typeof BUILTINS;
const LAYERS = Object.keys(BUILTINS) as Layer[];

const readme = (name: Layer): string => readFileSync(join(ROOT, 'packages', name, 'README.md'), 'utf8');

/** The header block (every leading `<p …>…</p>`) and the first paragraph after it. */
function opening(text: string): string {
  const lines = text.split('\n');
  let i = 0;
  const out: string[] = [];
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line === '') i += 1;
    else if (line.startsWith('<p')) {
      while (i < lines.length && !lines[i]!.includes('</p>')) out.push(lines[i++]!);
      out.push(lines[i++] ?? '');
    } else break;
  }
  while (i < lines.length && lines[i]!.trim() !== '') out.push(lines[i++]!);
  return out.join('\n');
}

/** Prose only: attribute values and link targets are addresses, not words a reader reads as a name. */
const prose = (text: string): string =>
  text
    .replace(/\b(?:href|src|srcset)="[^"]*"/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, '');

/** What is wrong with one README, or nothing. */
function problems(name: Layer, text: string): string[] {
  const out = BUILTINS[name].filter((b) => !text.includes(b)).map((b) => `${name}'s README does not name \`${b}\`, the builtin it builds on (Y4)`);
  if (/\bburgee\b/i.test(prose(opening(text)))) out.push(`${name}'s README names burgee in its opening — lead with the package and its incumbents (Y12)`);
  return out;
}

describe('each foundation README names its builtin, and opens on its own (cli-foundation-stack Y4, Y12)', () => {
  it.each(LAYERS)('%s', (name) => {
    expect(problems(name, readme(name))).toEqual([]);
  });

  it('names, for every layer, the builtin the absorption probe points at', () => {
    const named: readonly string[] = LAYERS.flatMap((name) => BUILTINS[name]);
    for (const probe of PROBES) expect(named.some((b) => b.endsWith(probe.builtin) || probe.builtin.endsWith(b)), probe.layer).toBe(true);
  });
});

describe('the lock can fail', () => {
  it('fails a README that drops its builtin', () => {
    const text = readme('seniority').replaceAll('util.parseEnv', 'the parser');
    expect(text, 'the edit did not apply, so this proves nothing').not.toBe(readme('seniority'));
    expect(problems('seniority', text)).toEqual([expect.stringMatching(/does not name `util.parseEnv`/)]);
  });

  it('fails an opening that names burgee, in the header or the first paragraph', () => {
    const head = readme('closeout').replace('Exit handlers that run exactly once', 'The burgee exit handlers that run exactly once');
    expect(head).not.toBe(readme('closeout'));
    expect(problems('closeout', head)).toEqual([expect.stringMatching(/names burgee in its opening/)]);
    const first = readme('bellpull').replace('**bellpull** runs a subprocess', '**bellpull** runs a subprocess for burgee');
    expect(first).not.toBe(readme('bellpull'));
    expect(problems('bellpull', first)).toEqual([expect.stringMatching(/names burgee in its opening/)]);
  });

  it('reads past a URL that names the repository, and past the opening', () => {
    expect(prose('<a href="https://github.com/ofri-peretz/burgee"><img src="x" alt="y" /></a> [docs](https://burgee.interlace.tools)')).not.toMatch(/burgee/);
    expect(opening('<p align="center">\n  tag\n</p>\n\nfirst paragraph\nstill first\n\nsecond, with burgee')).toBe('<p align="center">\n  tag\n</p>\nfirst paragraph\nstill first');
  });
});
