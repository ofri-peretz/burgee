/**
 * R11 — the two corpora, imported. Graded against the real packages, not against a fixture
 * of my own shape: `cli-spinners` and `cli-boxes` are devDependencies here so the test
 * fails the day either changes its JSON, which is the only way this claim stays true. They
 * are deliberately *not* on dependabot's ignore list — the pinned entries there are the
 * hosts' own suites, which must match a vendored release; these two are meant to move, and
 * catching the move is the job.
 *
 * The load-bearing assertion is the last one in each block: after `register()`, the corpus
 * is reachable through the ordinary lookups — `spinner('moon')` and `box(…, { border:
 * 'arrow' })` — with no import path of its own. A corpus that needed a private door would
 * not be a plugin, it would be a second built-in table.
 */
import cliBoxes from 'cli-boxes';
import cliSpinners from 'cli-spinners';
import { describe, expect, it } from 'vitest';

import { box } from './box.js';
import { fromCliBoxes, fromCliSpinners } from './import.js';
import { lookupBorder, lookupSpinner, PluginError, register, registered, validate } from './plugin.js';
import { spinner } from './spinner.js';

/** cli-spinners' own `randomSpinner` export: a function sitting among the styles. */
const notAStyle = (): undefined => undefined;

describe('fromCliSpinners', () => {
  const plugin = fromCliSpinners(cliSpinners as Record<string, { frames: string[]; interval?: number }>);

  it('is a plugin the shipped schema accepts', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(plugin.name).toBe('cli-spinners');
  });

  it('carries the whole corpus, each style with the projection cli-spinners has none of', () => {
    expect(Object.keys(plugin.spinners ?? {}).length).toBeGreaterThan(80);
    expect(plugin.spinners?.['dots']).toEqual({ frames: cliSpinners.dots.frames, interval: cliSpinners.dots.interval, static: '…' });
  });

  it('skips what is not a style — a caller who passes the module, not the JSON', () => {
    const withFunction = { ...cliSpinners, randomSpinner: notAStyle as unknown as { frames: string[] } };
    const out = fromCliSpinners(withFunction as Record<string, { frames: string[]; interval?: number }>);
    expect(out.spinners?.['randomSpinner']).toBeUndefined();
    expect(out.spinners?.['dots']).toBeDefined();
  });

  it('takes the projection from the caller when they have an opinion', () => {
    const out = fromCliSpinners({ moon: { frames: ['🌑', '🌒'], interval: 80 } }, { name: 'mine', staticFor: (name) => `${name}…` });
    expect(out.spinners?.['moon']?.static).toBe('moon…');
    expect(out.name).toBe('mine');
  });

  it('registered, the whole corpus is reachable through the ordinary lookup', () => {
    register(plugin);
    expect(registered().plugins).toContain('cli-spinners');
    expect(lookupSpinner('moon').frames).toEqual(cliSpinners.moon.frames);
    // And through the component, which never learns where its style came from.
    expect(spinner('moon').static({ text: 'waiting' })).toBe('… waiting');
  });
});

describe('fromCliBoxes', () => {
  const plugin = fromCliBoxes(cliBoxes as unknown as Record<string, Record<string, string>> as never);

  it('is a plugin the shipped schema accepts, and its shape is already ours', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(Object.keys(plugin.borders ?? {}).length).toBeGreaterThan(5);
    expect(plugin.borders?.['single']).toEqual(cliBoxes.single);
  });

  it('registered, box() draws with a border it never heard of', () => {
    register(plugin);
    expect(lookupBorder('arrow')).toEqual(cliBoxes.arrow);
    const drawn = box('hi', { width: 12, border: 'arrow' });
    expect(drawn.split('\n')[0]?.startsWith(cliBoxes.arrow.topLeft)).toBe(true);
  });

  it('a border nobody registered is refused with the list and a fix', () => {
    try {
      box('hi', { border: 'nope' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PluginError);
      expect((error as PluginError).code).toBe('E_UNKNOWN_BORDER');
      expect((error as PluginError).fix).toContain('register a plugin that defines it');
    }
  });
});

/**
 * The rule is "no external dependency, and neither corpus", not "the dependency list is
 * exactly `['roundel']`". Written the second way it went red on 2026-09-09 for `linegauge`
 * — a same-repo foundation package, which U6 permits — and a lock that has to be edited
 * every time an allowed thing happens is teaching whoever edits it to stop reading it.
 */
describe('the corpora are not bundled (U5)', () => {
  /** The packages this repo publishes. A dependency on one is a same-repo edge (U6). */
  const SAME_REPO = new Set(['roundel', 'linegauge', 'flagstaff', 'caique', 'burgee', 'bellpull', 'closeout', 'seniority']);

  it('neither corpus is a dependency: they are the caller’s, and this module only reshapes them', async () => {
    const manifest = (await import('../package.json', { with: { type: 'json' } })) as { default: { dependencies: Record<string, string> } };
    const deps = Object.keys(manifest.default.dependencies);
    expect(deps).not.toContain('cli-spinners');
    expect(deps).not.toContain('cli-boxes');
  });

  it('every dependency is a package this repo publishes (U6: 0 external)', async () => {
    const manifest = (await import('../package.json', { with: { type: 'json' } })) as { default: { dependencies: Record<string, string> } };
    const external = Object.keys(manifest.default.dependencies).filter((d) => !SAME_REPO.has(d));
    expect(external, 'flagstaff ships zero external dependencies').toEqual([]);
  });
});
