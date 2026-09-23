/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — an `overrides` recipe a reader can copy actually links.
 *
 * `overrides: { "exit-hook": "npm:closeout@^0.3" }` makes every `import … from 'exit-hook'`
 * load closeout's ROOT. closeout's drop-ins live at subpaths (`closeout/exit-hook`,
 * `closeout/restore-cursor`, `closeout/signal-exit`), and the root carried none of
 * exit-hook's three exports and neither drop-in's default — so the recipe the README
 * printed, for two incumbents at once, did not resolve for either (D-133). An override can
 * only aim at a package root, and a root has one default.
 *
 * What this asserts: for every `"<incumbent>": "npm:<ours>@…"` pair in a published README,
 * every name the installed incumbent exports is also exported by our package's root entry.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

const PAIR = /"([a-z][a-z-]*)":\s*"npm:([a-z][a-z-]*)@/gu;

/** Our package's root entry, by path — a bare name can resolve another checkout's dist/. */
const rootOf = (name: string): string => {
  const manifest = JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as { exports: Record<string, string | { import?: string; default?: string }> };
  const dot = manifest.exports['.']!;
  return join(PACKAGES, name, typeof dot === 'string' ? dot : (dot.import ?? dot.default)!);
};

const recipes = readdirSync(PACKAGES)
  .map((dir) => join(PACKAGES, dir, 'README.md'))
  .filter((readme) => existsSync(readme))
  .flatMap((readme) => [...readFileSync(readme, 'utf8').matchAll(PAIR)].map(([, incumbent, ours]) => ({ readme: readme.slice(ROOT.length + 1), incumbent: incumbent!, ours: ours! })))
  .filter(({ ours }) => existsSync(join(PACKAGES, ours, 'package.json')));

describe('an overrides recipe resolves against our root', () => {
  it('found recipes to check', () => {
    expect(recipes.length).toBeGreaterThan(0);
  });

  it.each(recipes)('$readme: $incumbent → $ours', async ({ incumbent, ours }) => {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- importing is the assertion: the incumbent is named by the README under test, and it must be installed here to be compared
    const theirs = Object.keys(await import(incumbent));
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- our root entry, by path from its own package.json exports map, never from an input
    const mine = new Set(Object.keys(await import(pathToFileURL(rootOf(ours)).href)));
    expect(theirs.filter((name) => !mine.has(name)), `${ours}'s root is missing what ${incumbent} exports`).toEqual([]);
  });
});
