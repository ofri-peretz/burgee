/**
 * Weight, per entry point. Mirrors `closeout/src/weight.test.ts`, `caique/src/weight.test.ts`
 * and `roundel/src/weight.test.ts`, and exists for one reason paratext learnt the hard way.
 *
 * **The engine could not take this dependency, and the number is why.** `burgee`'s `--help`
 * wanted OSC 8 — a real hyperlink where the terminal does one, `Docs (https://x.dev)` on a
 * pipe. `help.ts` is imported *statically* by `execute.ts`, so anything help reaches is paid
 * for by `burgee foo --json` too; and paratext published `.`, `./plugin` and `./schema.json`
 * and nothing narrower. The root is **17,574 B** and calls `registerBuiltins()` at import,
 * so the offer was seventeen kilobytes and seven registrations on every invocation, for one
 * feature of one flag. `./link` is **2,337 B** and registers nothing.
 *
 * It reads `dist/`, so it measures what is published rather than what is written — after
 * `scripts/strip-comments.mjs`, which is where most of this package's source bytes go.
 *
 * **The three assertions are not interchangeable.** The budget catches growth; the deny-list
 * catches the *shape* of the growth, which is the thing that actually bit here. A `./link`
 * that reached `capability.js` would still be small and would still be wrong: `capability.js`
 * carries the registry and pulls `schema.json`, which is 6,531 B of plugin contract that a
 * caller printing one URL has no use for. And `index.js` runs `registerBuiltins()` as an
 * import-time side effect, so reaching it is not a size regression, it is a *behaviour* one.
 * `src/link.test.ts` asserts the side-effect half directly, by importing the subpath and
 * finding the registry empty; this file asserts the reachability that makes that true by
 * construction.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string } | string>;
}

// Read rather than import: the published entry list is data here, and a JSON import would
// reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import. Empty everywhere: paratext depends on nothing. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  /**
   * Everything: the seven capabilities, the registry, `check()`, the template language, the
   * `ansi-escapes` surface, and `schema.json` — which is 6,531 B of it, a third of the whole
   * entry, because the family's plugin contract is one file and every host ships it whole.
   * Measured 17,574 B on 2026-09-15, up from 16,955 B before `./link` was split out: two new
   * module boundaries and their re-export lines. Recorded rather than smoothed.
   */
  '.': { allow: [], budget: 19_000, denied: ['plugin.js'] },
  /**
   * OSC 8 alone, for a host that wants one clickable URL and not a plugin contract.
   * Measured **2,337 B**: `link.js` 768, `template.js` 774, `supports.js` 652,
   * `runtime.js` 143. The budget is deliberately close — this entry exists *because* of its
   * size, so a change that doubles it should have to say so here.
   */
  './link': { allow: [], budget: 3_000, denied: ['index.js', 'capability.js', 'builtins.js', 'plugin.js', 'ansi-escapes.js', 'schema.json'] },
  /**
   * The plugin host: `validate`, `contributions`, `attach`, and the `check()` it delegates
   * to, which is what pulls `schema.json`. Measured 15,116 B. It must never reach `index.js`
   * — registering a plugin is not a reason to register seven built-ins.
   */
  './plugin': { allow: [], budget: 16_500, denied: ['index.js', 'builtins.js', 'ansi-escapes.js'] },
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
    // Publishing `paratext/image` without a budget here fails, which is the point: a new
    // surface cannot ship until someone has said what it may weigh. `./schema.json` is a
    // string target, not a module graph, so it is not one of these.
    const code = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object')
      .map(([subpath]) => subpath);
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });

  it('depends on nothing, which is the claim the whole family makes', () => {
    for (const subpath of Object.keys(RULES)) {
      expect(walk(entryFile(subpath)).external, `${subpath} reaches a package`).toEqual([]);
    }
  });

  it('`./link` is the entry a cold start can afford — under a sixth of the root', () => {
    // The relation, not just the absolute number: the root may grow, and when it does this
    // says whether the narrow entry still bought anything.
    const root = walk(entryFile('.')).bytes;
    const link = walk(entryFile('./link')).bytes;
    expect(link * 6).toBeLessThanOrEqual(root);
  });
});
