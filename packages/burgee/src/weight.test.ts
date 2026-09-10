/**
 * K6/B4 — weight is paid per import, never per config.
 *
 * Selecting commander-, yargs- or native-shaped burgee is an *import specifier*,
 * resolved by the bundler, not a runtime `config.mode`. A runtime flag would ship
 * every front-end to every user and decline to execute two of them — full weight,
 * no benefit (competitor map §6). Separate entry points mean a user who imports
 * `burgee` never has commander or yargs in their bundle, and tree-shaking works
 * because there is nothing to shake: the bytes were never pulled in.
 *
 * This walks the import graph of every entry point in `exports` and asserts what
 * each may reach. The important property is the last test: **an entry point
 * cannot be added without declaring its budget here**, so this lock grows with the
 * package instead of rotting behind it.
 *
 * It reads `dist/`, so it measures what is published rather than what is written.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string }>;
}

// Read rather than import: the published entry list is data here, and a JSON
// import would reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import. The host front-ends will name their peer. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // The engine. Imports nothing at all, and never drags the harness in.
  // Raised from 12,000 on 2026-09-07, deliberately and once: the entry now reaches
  // the execution core and the manifest, which is the whole engine and is what
  // `import 'burgee'` should give you. 12 KB against commander's 232 KB installed.
  // Raised from 20,000 on 2026-09-07, deliberately and once more: help is rendered from
  // the manifest in core (H1 of cli-help-renderer), which is 6 KB of renderer replacing
  // 1.5 KB of placeholder. 32 KB for engine + manifest + help, against commander's
  // lib/help.js alone at 20.8 KB.
  // Raised from 32,000 on 2026-09-08 for the V family (commander-env): precedence, its
  // provenance and --explain run on every invocation, so they are core, not a lazy entry.
  // Core is now engine + manifest + help + schema + mcp + precedence: 35 KB against
  // commander's 126 KB lib/. Config discovery itself stays lazy (burgee loads it only for a
  // program that opted in), as do the completion templates.
  // Raised from 40,000 on 2026-09-08 for the S family (commander-schema): validation —
  // numbers, choices, relations, Standard Schema — runs on every invocation. Core is now
  // engine + manifest + help + schema + mcp + precedence + validate, 42.7 KB against
  // commander's 126 KB lib/. Each floor family has cost about 5 KB; the lock stays to
  // catch the accidental kind of growth, and each of these was a decision in a PR.
  // dev.js is the dev loop: dev-time only and removable (dev-loop W4), so the framework
  // never reaches it; the CLI reaches it through a dynamic import, paid only on `burgee dev`.
  // Raised from 48,000 on 2026-09-08 by the width of one function: startMcp(), the swappable
  // server the dev loop swaps manifests into, which serveMcp() now wraps (+0.4 KB; 48.1 KB
  // measured). The dev loop itself stays out of core — see the denied list.
  // Raised from 50,000 on 2026-09-08 for cli-modularity (M2 lazy nodes, M4 shared options,
  // M5 the deprecation warning, M6 resolveCommand/runCommand) and the required-positional
  // check the M6 test exposed: 50.2 KB measured before the check. Core is now 51 KB
  // against commander's 126 KB lib/.
  // Raised again (same day, same 50,000 ceiling) for the theme seam (help renderer R7, roundel "used
  // without being imported"): `renderHelp({ color, theme })` and its four styleText defaults
  // are 1 KB of core, since help is core. 49.0 KB against commander's 126 KB lib/.
  // The output stack is denied by name (U13 of cli-output-stack): `import 'burgee'` never
  // resolves a family specifier. `allow: []` already forbids every bare import; naming
  // these three records the decision, so a future `allow` entry cannot admit them by accident.
  // 52,000 was main's ceiling after the large-CLI work (#33), with the theme seam measuring
  // 51,921 inside it. Raised to 52,100 on 2026-09-09, and this is the decision that ratchet
  // exists to force rather than a drift: `--version` on a program that is a pure command
  // group answered `unknown command "--version"` and **exit 2**, where real commander and
  // real yargs both print the version and exit 0. Under E1 exit 2 means *rewrite the
  // command*, so an agent asked for a version rewrote it until it gave up — on the flag
  // people type first. The fix costs **114 bytes** (51,921 → 52,035), written as two string
  // comparisons rather than a `Set`, which was 57 bytes more for the same behaviour. The
  // ceiling is the next hundred above the measurement, leaving 65 bytes.
  //
  // The published claim is untouched: "the core entry point is under 52 KB **bundled**" is
  // a different measurement — 34,841 bytes against a 53,248 target — and this budget is
  // bytes on disk of the `dist/` files an import reaches.
  //
  // Raised again to 52,900 on 2026-09-09, for `agent-headroom` R1, and stated the same way.
  // The `--version` fix above left **20 bytes** of headroom — 52,680 measured against 52,700 —
  // so R1 is the first change of any size to arrive after it. R1 costs **213 bytes**
  // (52,680 → 52,893) and takes 16,548 off *every* `--schema` an agent reads: 39,512 → 22,964
  // on the large reference demo, for a byte-identical parse. Paid once per install against a
  // saving per invocation, which is the whole trade.
  '.': { allow: [], budget: 52_900, denied: ['testing.js', 'testing-helpers.js', 'dev.js', 'roundel', 'flagstaff', 'caique'] },
  //
  // `agent-headroom` R1 adds **134 bytes** on top of that (52,035 -> 52,169), inside the same
  // ceiling, and it is the same kind of decision: 134 bytes of core, paid once per install,
  // remove 16,548 bytes from *every* `--schema` an agent reads (39,512 -> 22,964 on the large
  // reference demo). `machineJson` lives in `schema.ts` rather than a module of its own
  // precisely to keep that 134 from being 215.
  // The harness. Test-time only, so a user's shipped CLI never pays for it.
  // Raised from 24,000 with `.` above: the harness reaches the whole engine to run a
  // program in-process, so it carries the renderer too.
  // Raised from 56,000 on 2026-09-08, once: the harness reaches the whole engine, so it
  // carries the theme seam and the fake clock (56,626 measured).
  './testing': { allow: [], budget: 58_000, denied: ['dev.js'] },
  // The brand generator. Pure geometry and string building — it must never reach
  // the engine, and the engine must never reach it: a CLI that ships argv parsing
  // has no reason to carry an SVG emitter.
  // The package's own command line. It is allowed to reach the engine — it IS a burgee
  // command, which is the point of it — but a user importing `burgee` must never
  // reach it, which the '.' rule's own denied list would catch.
  // Raised from 60,000 on 2026-09-08: it reaches the whole engine (48 K budget) plus the
  // brand tooling; the engine grew by three floor families this week.
  // Raised from 72,000 on 2026-09-09 for the sibling marks: `shape` (a silhouette other
  // than the swallowtail), `markings` (a second colour on it), `sheen` and `bevel` (the
  // light on it, still and swept). Four options, one clip path and two renderers.
  './cli': {
    allow: ['roundel/contrast'],
    budget: 74_000,
    denied: ['testing.js', 'testing-helpers.js', 'dev.js'],
  },
  // Arithmetic over hex strings, and the arithmetic itself is roundel's — colour is the
  // layer below this one, and the WCAG maths lived in both packages until 2026-09-09.
  // Nothing in the engine reaches this: a CLI that ships argv parsing has no reason to
  // carry a contrast checker, which is why `.` still denies `roundel` outright.
  './contrast': {
    allow: ['roundel/contrast'],
    budget: 12_000,
    denied: ['index.js', 'execute.js', 'brand.js'],
  },
  './brand': {
    allow: [],
    budget: 16_000,
    denied: ['index.js', 'execute.js', 'manifest.js', 'testing.js', 'testing-helpers.js'],
  },
  // `allow: []` is the point: the compat front-ends *implement* the incumbents'
  // surfaces over our engine, they do not wrap the real packages, so they import
  // nothing either (J9). Real commander and yargs live only in compat-oracle, which
  // is private and never reaches a user.
  // Raised from 24,000 on 2026-09-07, deliberately and once: the front-end is commander 15
  // ported method for method (graded 1,327/1,331 by commander's own suite), and 24,000 was
  // a placeholder from before it existed. 128,000 is commander's own lib/ (126,365 B), so
  // the lock still proves the front-end is no heavier than the package it replaces.
  // `import 'burgee'` reaches none of it (entry `.` above).
  // The completion templates for four shells and Fig. Loaded by the engine and the
  // commander front-end only on `completion <shell>`, through a dynamic import, so a
  // program pays for them when it prints a script and never at startup (K6).
  './completions': { allow: [], budget: 16_000, denied: ['index.js', 'execute.js', 'testing.js', 'testing-helpers.js'] },
  './commander': { allow: [], budget: 128_000, denied: ['testing.js', 'testing-helpers.js', 'dev.js'] },
  // yargs 18 ported method for method, with its whole dependency tree — yargs-parser 22,
  // cliui 9 (string-width, wrap-ansi), y18n 5, escalade, get-caller-file — because burgee
  // depends on nothing (J9). 256,000 is what `npm install yargs` puts on disk for the same
  // surface (yargs lib/ 158 K + yargs-parser 52 K + the rest), so the lock proves the
  // front-end is no heavier than the package it replaces. `import 'burgee'` reaches none
  // of it. The 29 locales are JSON read at runtime, not imports, so they are not walked.
  './yargs': { allow: [], budget: 256_000, denied: ['testing.js', 'testing-helpers.js', 'dev.js'] },
  './yargs/helpers': { allow: [], budget: 64_000, denied: ['testing.js', 'testing-helpers.js', 'yargs-factory.js'] },
  // yargs-parser alone, for a program that imported it directly; never the factory.
  './yargs/parser': { allow: [], budget: 40_000, denied: ['testing.js', 'testing-helpers.js', 'yargs-factory.js', 'yargs-shim.js'] },
};

/**
 * Static imports are what an entry costs at startup. A dynamic `import('./x.js')` is paid
 * only on the path that runs it (K6), so it is reported as `lazy` and not counted — an
 * entry may defer a rarely used surface without carrying it for every run.
 */
const SPECIFIER = /(?:from|import)\s*'([^']+)'/g;
const LAZY = /import\(\s*'([^']+)'\s*\)/g;

/** One file's imports: static specifiers to follow or count, dynamic ones only to report. */
function scan(source: string): { specs: string[]; lazy: string[] } {
  return {
    specs: [...source.matchAll(SPECIFIER)].map((m) => m[1] ?? ''),
    lazy: [...source.matchAll(LAZY)].map((m) => m[1] ?? ''),
  };
}

function walk(entry: string): { reached: string[]; external: string[]; bytes: number; lazy: string[] } {
  const files = new Set<string>();
  const external = new Set<string>();
  const lazy = new Set<string>();
  const queue = [entry];
  let bytes = 0;

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    const found = scan(readFileSync(file, 'utf8'));
    for (const spec of found.lazy) lazy.add(spec);
    for (const spec of found.specs) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (spec !== '' && !spec.startsWith('node:')) external.add(spec);
    }
  }
  return { reached: [...files].map((f) => relative(dist, f)), external: [...external], bytes, lazy: [...lazy] };
}

/**
 * A `.js` entry names one dist file exactly. A bare specifier names a package, so it also
 * covers every subpath of it: `roundel` denies `roundel/tokens` too, which a later `allow`
 * entry could otherwise admit through the side door.
 */
function isDenied(name: string, denied: string): boolean {
  if (denied.endsWith('.js')) return name === denied;
  return name === denied || name.startsWith(`${denied}/`);
}

function entryFile(subpath: string): string {
  const conditions = manifest.exports[subpath];
  if (conditions === undefined) throw new Error(`no exports entry for ${subpath}`);
  return resolve(pkgRoot, conditions.import);
}

describe.each(Object.keys(RULES))('entry %s', (subpath) => {
  const rule = RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath));

  it('imports only what its rule allows', () => {
    expect(graph.external.sort()).toEqual([...rule.allow].sort());
  });

  it('reaches nothing on its denied list', () => {
    // A denied name may be a dist file (the harness) or a bare specifier (the output stack).
    const everything = [...graph.reached, ...graph.external];
    for (const denied of rule.denied) expect(everything.filter((name) => isDenied(name, denied))).toEqual([]);
  });

  it('stays inside its byte budget', () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe('the denied list', () => {
  it('denies a subpath of a bare specifier for entry `.`, and a dist file only exactly', () => {
    const rule = RULES['.'] as EntryRule;
    const roundel = rule.denied.find((d) => d === 'roundel') ?? '';
    expect(isDenied('roundel/tokens', roundel)).toBe(true);
    expect(isDenied('roundel', roundel)).toBe(true);
    expect(isDenied('roundelle', roundel)).toBe(false);
    expect(isDenied('testing-helpers.js', 'testing.js')).toBe(false);
  });
});

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    // Adding `burgee/commander` without a budget here fails, which is the point:
    // a new surface cannot ship until someone has said what it may weigh.
    expect(Object.keys(manifest.exports).sort()).toEqual(Object.keys(RULES).sort());
  });
});
