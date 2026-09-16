/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Weight, per entry, against the incumbents the entry replaces (design R8, Y8). Mirrors
 * `closeout/src/weight.test.ts` and `caique/src/weight.test.ts`.
 *
 * It reads `dist/`, so it measures what is published rather than what is written.
 *
 * ## The honest state of R8, which is that R8 is the wrong ceiling
 *
 * R8 asks for bytes "at or under **`tinyexec`**" — the zero-dependency rival, not `execa` —
 * and says a ceiling set at `execa` would be a free pass. That is the right instinct and it
 * is the wrong comparison for what got built, for a reason the requirement could not have
 * anticipated: `tinyexec` does not resolve executables, and roughly half of what is on disk
 * here is resolution. Comparing the two on bytes compares a package that answers "which
 * binary ran" against one that cannot, and the smaller number wins by not doing the job.
 *
 * So three claims, and only the ones that are true:
 *
 *   - **dependencies: 0** — asserted below for every entry, and the half of "weight" that
 *     compounds, since a dependency is a tree and a supply chain. `cross-spawn` has three
 *     (`path-key`, `shebang-command`, `which`, and `which` brings `isexe`); `execa` has
 *     twelve direct and sixteen packages.
 *   - **the package replaces `cross-spawn` (46,962 B installed) + `which` (20,931 B) at
 *     82,270 B of its own**, against a `ceiling` in
 *     `.sdlc/bands/foundation-ceilings.json` of 714,984 B — a ratio of **0.1151**, up from
 *     0.0067 when this package was seven lines and did nothing. That rise is the honest
 *     direction and is recorded rather than smoothed: a ratio that only ever improves is a
 *     ratio nobody is watching.
 *   - **against `tinyexec` alone: not measured here, and not claimed.** `tinyexec` is not
 *     installed in this workspace, so a number would be a number nothing measured.
 *
 * `.sdlc/bands/foundation-ceilings.json` is forbidden to every lane but `integrator`
 * (`.sdlc/LANES.md`), so this file *reports* the change rather than making it. The last
 * block computes the replacement from the same `npm pack` the band itself uses and pins
 * both the old value and the new one, so the handoff is a measurement in a file rather than
 * a sentence in a commit message — and so it goes stale loudly if this package grows again
 * before the integrator writes it.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ambientRuntime } from './ambient.js';
import { parse } from './spawn-args.js';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string } | string>;
}

// Read rather than import: the published entry list is data here, and a JSON import would
// reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import. Empty everywhere: bellpull depends on nothing. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // Everything but the drop-in and the plugin host: run, the deadline, resolution, the three
  // projections. Measured 18,314 B on 2026-09-15.
  '.': { allow: [], budget: 19_000, denied: ['plugin.js', 'cross-spawn.js'] },
  // Resolution alone — the part of this layer nobody contests, and a leaf by construction:
  // a program that only needs to find a binary does not load a spawner to do it. That is
  // also the design's "`which` ships first, and possibly alone". Measured 5,367 B.
  './which': { allow: [], budget: 6_500, denied: ['run.js', 'index.js', 'cross-spawn.js', 'plugin.js', 'project.js', 'enoent.js'] },
  // The drop-in for `cross-spawn` (212.2 M/wk), graded 68 / 68 by its own suite. It reaches
  // `ambient.js` — deliberately, and the only entry that does: a drop-in reads `process`
  // because its callers expect it to. Measured 12,852 B.
  './cross-spawn': { allow: [], budget: 14_000, denied: ['plugin.js', 'index.js', 'run.js', 'project.js'] },
  // The plugin host. Carries the runtime shape, never the spawner — registering a plugin
  // must not pull a subprocess API in. Measured 6,818 B.
  './plugin': { allow: [], budget: 8_000, denied: ['run.js', 'index.js', 'cross-spawn.js', 'which.js', 'ambient.js'] },
};

const SPECIFIER = /(?:from|import)\s*'([^']+)'/g;

function walk(entry: string): { reached: string[]; external: string[]; bytes: number } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  let bytes = 0;

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    for (const [, spec = ''] of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (spec !== '' && !spec.startsWith('node:')) external.add(spec);
    }
  }
  return { reached: [...files].map((f) => relative(dist, f)), external: [...external], bytes };
}

function entryFile(subpath: string): string {
  const conditions = manifest.exports[subpath];
  if (typeof conditions !== 'object') throw new Error(`no code exports entry for ${subpath}`);
  return resolve(pkgRoot, conditions.import);
}

describe.each(Object.keys(RULES))('entry %s', (subpath) => {
  const rule = RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath));

  it('imports only what its rule allows', () => {
    expect(graph.external.sort()).toEqual([...rule.allow].sort());
  });

  it('reaches nothing on its denied list', () => {
    for (const denied of rule.denied) expect(graph.reached).not.toContain(denied);
  });

  it('stays inside its byte budget', () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    // Adding `bellpull/execa` without a budget here fails, which is the point: a new
    // surface cannot ship until someone has said what it may weigh.
    const code = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object')
      .map(([subpath]) => subpath);
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });

  it('depends on nothing, which is the claim the whole family makes — and cross-spawn cannot', () => {
    for (const subpath of Object.keys(RULES)) {
      expect(walk(entryFile(subpath)).external, `${subpath} reaches a package`).toEqual([]);
    }
  });

  it('keeps `./which` free of the spawner, so resolution can be adopted on its own', () => {
    // The design's order: "`which` ships first, and possibly alone". A caller who wants only
    // the 779 M/wk that `which` + `isexe` + `path-key` cover must not pay for `run`.
    expect(walk(entryFile('./which')).reached.filter((f) => f.endsWith('.js')).sort()).toEqual(['runtime.js', 'which.js']);
  });

  /**
   * Y9, locked where it is actually claimed.
   *
   * The claim is not "no file in the package mentions `process`" — `ambient.ts` exists to,
   * and `index.ts` re-exports `ambientRuntime` so a caller can get a `Runtime` without
   * rewriting the guarded global lookup themselves. The claim is that **the working code
   * never reads the ambient world**: `run`, `which`, `spawn-args` and the rest take a
   * `Runtime` and read nothing else, so their answers are a function of their arguments.
   *
   * Asserted over the shipped source rather than the import graph, because the graph cannot
   * tell a re-export from a read — which is exactly how this assertion was wrong first.
   */
  it('no module but `ambient` reads the ambient world (Y9)', () => {
    const MAY_READ = new Set(['ambient.js']);
    const offenders: string[] = [];
    for (const subpath of Object.keys(RULES)) {
      for (const file of walk(entryFile(subpath)).reached.filter((f) => f.endsWith('.js'))) {
        if (MAY_READ.has(file)) continue;
        const text = readFileSync(resolve(dist, file), 'utf8');
        // `globalThis` is how the guarded lookup is spelled; `process.` is how an unguarded
        // one would be. Either in a file that is not `ambient.js` is the bug.
        if (/globalThis|process\./.test(text)) offenders.push(file);
      }
    }
    expect(offenders, 'these read the ambient world instead of taking a Runtime — Y9').toEqual([]);
  });

  it('`./which` and `./plugin` do not even reach the file that could', () => {
    // The two leaves. A caller adopting resolution alone, or registering a plugin, loads
    // nothing that has ever heard of `process`.
    for (const subpath of ['./which', './plugin']) {
      expect(walk(entryFile(subpath)).reached, `${subpath} reaches ambient.js`).not.toContain('ambient.js');
    }
  });
});

/**
 * What the integrator lane has to change, asserted rather than written in a report.
 *
 * `.sdlc/bands/foundation-ceilings.json` is forbidden to every lane but `integrator`
 * (`.sdlc/LANES.md`), so this lane cannot correct the number. It can make the stale number
 * fail loudly and name the replacement, which is the difference between a handoff and a
 * sentence in a commit message nobody reads.
 */
describe('the ceilings file', () => {
  /**
   * `npm pack`, spawned through this package's own `parse`.
   *
   * This line used to be `execFileSync('npm', …)`, and on Windows it was **the exact defect
   * bellpull exists to fix**: `npm` is `npm.cmd`, and since the fix for CVE-2024-27980 Node
   * refuses to spawn a `.cmd` or `.bat` without `shell: true`. So the weight lock of the
   * package whose README opens with that sentence was the thing it broke on, and both cases
   * below died before they measured anything — which is why the Windows run reported a
   * thrown error rather than an assertion.
   *
   * The two fixes already written in this repository are the wrong two. `shape.test.ts` takes
   * `WINDOWS ? 'npm.cmd' : 'npm'` with `shell: WINDOWS`, which is the injection surface
   * `escape.ts`'s header is about; `ambient-colour.test.ts` sidesteps it by spawning the
   * built `bin.js` with `process.execPath`, which works only when there is a `.js` entry to
   * aim at. `npm pack` has neither. `parse` is the third option and the one this package is:
   * it resolves `npm.CMD` through `PATHEXT`, builds the `cmd.exe /d /s /c` line itself, and
   * escapes every argument, so nothing is handed to a shell as text.
   *
   * It is also the only place in the suite where the Windows spawn path is driven by
   * something other than a test fixture, which makes it the closest thing here to a real
   * consumer.
   */
  const measured = (): number => {
    const parsed = parse('npm', ['pack', '--dry-run', '--json'], { cwd: pkgRoot }, ambientRuntime());
    const result = spawnSync(parsed.command, parsed.args, { ...parsed.options, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] } as never);
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`npm pack exited ${String(result.status)}: ${String(result.stderr)}`);
    return (JSON.parse(result.stdout as unknown as string) as { unpackedSize: number }[])[0]?.unpackedSize ?? 0;
  };
  const PACK_TIMEOUT_MS = 120_000;
  const band = (): { ours: number; ceiling: number; ratio: number } =>
    (JSON.parse(readFileSync(resolve(pkgRoot, '../../.sdlc/bands/foundation-ceilings.json'), 'utf8')) as { layers: Record<string, { ours: number; ceiling: number; ratio: number }> }).layers['bellpull'] as {
      ours: number;
      ceiling: number;
      ratio: number;
    };

  it(
    'is the claim that is true: this package is under the ceiling it is measured against',
    () => {
      const ours = measured();
      const { ceiling } = band();
      // R8's requirement, in the form this package can meet. The ceiling is the installed,
      // tree-inclusive bytes of `execa` + `cross-spawn` + `which`, per D1.
      expect(ours).toBeLessThanOrEqual(ceiling);
    },
    PACK_TIMEOUT_MS,
  );

  it(
    'tracks the band: what this package weighs is what the ceilings file says it weighs',
    () => {
      const ours = measured();
      const { ceiling } = band();
      const ratio = Math.round((ours / ceiling) * 10_000) / 10_000;
      // `.sdlc/bands/**` is forbidden to every lane but `integrator` (`.sdlc/LANES.md`), so
      // this lane may not correct the recorded `ours`. What it can do is compute the
      // replacement here, from the same measurement the band uses, so the number handed over
      // is measured rather than transcribed — and so it goes stale loudly if this package
      // grows again before the integrator gets to it.
      //
      // **The handoff completed again on 2026-09-16, so this tracks rather than waits.** The
      // lane pinned 85,129 / 0.1191; the integrator measured **85,906 / 0.1202** on the merged
      // tree, because two bellpull branches landed together — the Windows resolution work and
      // the `childProcess.spawn` property read that lets a consumer under commander's mocks see
      // the mock. Neither lane could measure the other.
      //
      // The growth is `resolveExecutable` in `which.ts` (the two-attempt `PATHEXT` walk that
      // `run.ts` and `spawn-args.ts` must share — a single walk is the defect that made a
      // shebang script resolve for the parse and be refused by the run), the `startDeadline`
      // seam, and mostly the `.d.ts` doc comments both carry: `strip-comments.mjs` takes them
      // out of the `.js` and leaves them in the declarations, where a user still pays.
      //
      // Settling it took two iterations, and the band records why: `ours` is measured from a
      // tarball containing a README generated from `ours`, so writing the number changes it.
      // 85,905 became 85,906 when the ratio string grew a character.
      //
      // Still an order of magnitude under the 714,984 B it replaces. Equality against the band
      // rather than a literal is the durable form — the band follows the package, and either
      // moving without the other goes red here.
      const { ours: recordedOurs, ceiling: recordedCeiling, ratio: recordedRatio } = band();
      expect({ ours, ceiling, ratio }, 'the package and its recorded weight disagree — re-measure and update the band').toEqual({
        ours: recordedOurs,
        ceiling: recordedCeiling,
        ratio: recordedRatio,
      });
    },
    PACK_TIMEOUT_MS,
  );
});
