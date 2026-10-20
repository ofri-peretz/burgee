/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Weight, per entry, against the incumbent the entry replaces (design R8, U5). Mirrors
 * `caique/src/weight.test.ts` and `roundel/src/weight.test.ts`.
 *
 * It reads `dist/`, so it measures what is published rather than what is written, and it
 * grew a comment-stripping build step on the way in: 46,066 B of emitted JavaScript became
 * 20,417 B, and the difference was doc comments that every editor reads out of the `.d.ts`
 * files anyway.
 *
 * **What the measurement said about R8, stated rather than rounded away.** R8 asks for
 * bytes "at or under `exit-hook`", the lightest zero-dependency incumbent in the layer.
 * Measured 2026-09-14 against the vendored copy of `exit-hook@5.1.0` that `compat-oracle`
 * grades us with: its whole implementation is **4,458 B in one file**, and
 * `closeout/exit-hook` reaches **11,841 B** across five. That is over, and it is over for a
 * reason the ceiling did not anticipate — the drop-in shares `registry.ts`, `deadline.ts`
 * and `report.ts` with the rest of the package, which is to say it carries the phase
 * ordering, the bounded runner and the report that names a hung handler. Those three are
 * the product; deleting them to win a byte comparison against a package that cannot do any
 * of it would be optimising the number at the cost of the thing being measured.
 *
 * So the ceiling is recorded as two claims that are true and one that is not:
 *
 *   - **dependencies: 0, the same as `exit-hook`** — asserted below for every entry, and
 *     the half of "weight" that compounds, since a dependency is a tree and a supply chain.
 *   - **the whole package, 20,417 B, replaces six packages** totalling 685 M downloads a
 *     week — the comparison the layer is actually about.
 *   - **the per-file byte ceiling against `exit-hook` alone: not met, 11,841 vs 4,458.**
 *     The design says so in those words rather than quietly restating the requirement.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string; require?: string } | string>;
}

// Read rather than import: the published entry list is data here, and a JSON import would
// reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import. Empty everywhere: closeout depends on nothing. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // Everything: the registry, the wiring, the cursor, the deadline, the report, `once`.
  // Measured 11,644 B on 2026-09-14 and 12,171 B on 2026-09-27 before R4 was finished.
  // Raised 13,000 -> 14,500 that day: raw mode and the alternate screen paired with their
  // undos (cursor.js 666 -> 1,458 B), and the registry finishing the phases a drained loop
  // left behind (registry.js +264 B). Measured 13,846 B after. These are unminified dist
  // bytes; what a bundler keeps is `benchmarks/axes/weight.ts`'s number, and the two new
  // pairings tree-shake out of it (D-163). Raised 14,500 -> 14,800 on 2026-10-12: `rawMode`
  // counts its holders, so a prompt opened while a spinner discards stdin keeps raw mode
  // (.sdlc/models/save-restore.qnt). Measured 14,699 B after.
  '.': { allow: [], budget: 14_800, denied: ['plugin.js', 'exit-hook.js', 'restore-cursor.js'] },
  // `onetime` + `mimic-fn` are 262 M downloads a week between them and this is the whole of
  // what they do: 441 B, reaching nothing at all. Measured 2026-09-14.
  './once': { allow: [], budget: 1_000, denied: ['index.js', 'registry.js', 'install.js', 'report.js', 'deadline.js'] },
  // The escape sequences and the TTY rule, and a leaf by construction: a program that only
  // needs to put a cursor back does not load a registry to do it. Measured 666 B; 1,458 B
  // on 2026-09-27 once it carried all three of R4's pairings — cursor, alternate screen,
  // raw mode — inside the same budget. 1,786 B on 2026-10-05 with the fourth, bracketed paste,
  // which controlroom's input line needs (R20). Raised 1,900 -> 2,100 on 2026-10-12 for the
  // `rawMode` holder count — the one way to keep raw mode under a second caller. Measured 2,054 B.
  './cursor': { allow: [], budget: 2_100, denied: ['index.js', 'registry.js', 'install.js'] },
  // The plugin host. Carries the registry's phase vocabulary, never the process wiring —
  // registering a plugin must not attach four listeners. Measured 10,583 B.
  './plugin': { allow: [], budget: 12_500, denied: ['install.js', 'exit-hook.js', 'restore-cursor.js'] },
  // The drop-in for `restore-cursor` (107.5 M/wk), graded 6 / 6 by its own suite. Measured
  // 11,159 B — see the header for what that number is and is not. 11,686 B on 2026-09-27,
  // raised 12,500 -> 14,000 the same day: it reaches `install.js` and so carries R4's two
  // new pairings and the registry's drained-loop fix (+1,527 B). Measured 13,213 B after.
  // Raised 14,000 -> 14,300 on 2026-10-12 for the `rawMode` holder count. Measured 14,066 B.
  './restore-cursor': { allow: [], budget: 14_300, denied: ['plugin.js', 'exit-hook.js'] },
  // The drop-in for `exit-hook` (8.8 M/wk), graded 21 / 21 by its own suite. Measured
  // 11,841 B against the incumbent's 4,458 B in one file, when it ran through the registry.
  // Lowered 13,000 -> 3,800 on 2026-10-20 (closeout-at-incumbent-weight): it runs exit-hook's
  // own small machine (`lean.qnt`) and reaches the process door alone. Measured 3,717 B. The
  // registry, the deadline and the report are denied, so the phases cannot creep back in.
  './exit-hook': { allow: [], budget: 3_800, denied: ['plugin.js', 'restore-cursor.js', 'cursor.js', 'registry.js', 'deadline.js', 'report.js', 'install.js'] },
  // The drop-in for `signal-exit` (198.9 M/wk), graded 134 / 135 by its own suite — the case
  // it misses, signal-exit misses too. Measured 4,797 B on 2026-09-23 across the façade, its
  // signal list and `ambient.js`, against the incumbent's 10,995 B (`dist/cjs/index.js` +
  // `signals.js`). It never reaches the registry.
  // Since 2026-10-20 this is the ES door, what `import` reaches (closeout-at-incumbent-weight):
  // the machine, the list and the process door, and no CommonJS file, because a bundler wraps
  // a CommonJS file in interop that cost more than signal-exit's own ES build. Measured 4,797 B.
  // `REQUIRE_RULES` below weighs the CommonJS door.
  './signal-exit': { allow: [], budget: 4_900, denied: ['index.js', 'registry.js', 'install.js', 'exit-hook.js', 'signal-exit.cjs', 'signal-exit-signals.cjs'] },
  // The platform's fatal-signal list, alone. Measured 381 B. Raised 500 -> 550 on 2026-10-20
  // (D-20261020-closeout-drop-in-budgets): the list moved to `signal-list.js`, one copy for both
  // doors of `./signal-exit`, and this entry is now a CommonJS file that calls it. Measured 518 B.
  './signal-exit/signals': { allow: [], budget: 550, denied: ['index.js', 'registry.js', 'signal-exit.cjs'] },
  // The drop-in for `onetime` 8 (155.0 M/wk), graded 6 / 6 by its own suite
  // (`graded-override-targets` R3). A leaf, like `./once`. Measured 1,295 B on 2026-10-11,
  // against onetime 1,033 B + mimic-function 3,038 B.
  './onetime': { allow: [], budget: 1_400, denied: ['index.js', 'registry.js', 'install.js', 'report.js', 'deadline.js'] },
  // The drop-in for `cli-cursor` 5 (126.7 M/wk), graded 8 / 8 by its own suite (R4). It hides
  // through `./restore-cursor`, so it carries that entry's registry and wiring. Measured
  // 14,544 B on 2026-10-11, against the 15,679 B cli-cursor installs to do the same: cli-cursor
  // 694, restore-cursor 386, onetime 1,033, mimic-function 3,038 and signal-exit 10,528.
  './cli-cursor': { allow: [], budget: 15_000, denied: ['plugin.js', 'exit-hook.js'] },
};

/**
 * The `require` doors, for the entries that have one: what a CommonJS caller loads. Weighed
 * apart from `RULES` because the two doors of `./signal-exit` reach different files.
 */
const REQUIRE_RULES: Record<string, EntryRule> = {
  // The CommonJS door of `./signal-exit`, the file the suite re-evaluates. Measured 4,797 B on
  // 2026-09-23 when it was the only door, and 5,080 B on 2026-10-20 once the machine moved to
  // `signal-exit-core.js` for the ES door to share (+283 B of module seams, inside the budget).
  './signal-exit': { allow: [], budget: 5_500, denied: ['index.js', 'registry.js', 'install.js', 'exit-hook.js', 'signal-exit.js'] },
};

// `require("…")` as well: the `signal-exit` façade is CommonJS, and tsc prints its requires
// double-quoted. A walker that followed only `from '…'` would weigh that entry as one file.
const SPECIFIER = /(?:from|import|require\()\s*['"]([^'"]+)['"]/g;

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

function entryFile(subpath: string, condition: 'import' | 'require' = 'import'): string {
  const conditions = manifest.exports[subpath];
  if (typeof conditions !== 'object') throw new Error(`no code exports entry for ${subpath}`);
  const target = condition === 'require' ? conditions.require : conditions.import;
  if (target === undefined) throw new Error(`${subpath} has no ${condition} condition`);
  return resolve(pkgRoot, target);
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

describe.each(Object.keys(REQUIRE_RULES))('the require door of %s', (subpath) => {
  const rule = REQUIRE_RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath, 'require'));

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
  it('follows a CommonJS require, so the signal-exit require door is weighed with its signal list', () => {
    expect(walk(entryFile('./signal-exit', 'require')).reached).toContain('signal-exit-signals.cjs');
  });

  it('weighs every require door an entry declares', () => {
    const doors = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object' && target.require !== undefined)
      .map(([subpath]) => subpath);
    expect(doors.sort()).toEqual(Object.keys(REQUIRE_RULES).sort());
  });

  it('every published entry point declares a weight rule', () => {
    // Adding `closeout/signal-exit` without a budget here fails, which is the point: a new
    // surface cannot ship until someone has said what it may weigh.
    const code = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object')
      .map(([subpath]) => subpath);
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });

  it('depends on nothing, which is the claim the whole family makes — and exit-hook’s too', () => {
    for (const subpath of Object.keys(RULES)) {
      expect(walk(entryFile(subpath)).external, `${subpath} reaches a package`).toEqual([]);
    }
  });
});

/** npm on Windows is `npm.cmd`, which Node will only spawn through a shell. Fixed argv, nothing to escape. */
const WINDOWS = process.platform === 'win32';
const packed = (): number =>
  (JSON.parse(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], { cwd: pkgRoot, encoding: 'utf8', shell: WINDOWS, stdio: ['ignore', 'pipe', 'pipe'] })) as { unpackedSize: number }[])[0]?.unpackedSize ?? 0;

const bandLayer = (): { ours: number; ceiling: number; ratio: number } =>
  (JSON.parse(readFileSync(resolve(pkgRoot, '../../.sdlc/bands/foundation-ceilings.json'), 'utf8')) as { layers: Record<string, { ours: number; ceiling: number; ratio: number }> }).layers['closeout'] as {
    ours: number;
    ceiling: number;
    ratio: number;
  };

describe('the ceilings file', () => {
  it(
    'tracks the band: what this package weighs is what the ceilings file says it weighs',
    () => {
      // Added 2026-10-05: five of the six band layers had no test holding `ours`, and four of
      // them were stale on main. The band follows the package; either moving alone goes red here.
      const ours = packed();
      const { ours: recordedOurs, ceiling, ratio: recordedRatio } = bandLayer();
      expect({ ours, ratio: Number((ours / ceiling).toFixed(4)) }, 'the package and its recorded weight disagree — run `npm run weight:converge`').toEqual({
        ours: recordedOurs,
        ratio: recordedRatio,
      });
    },
    120_000,
  );
});
