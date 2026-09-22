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
   *
   * **Raised from 19,000 to 20,500 on 2026-09-16, and the reason is a defect this entry was
   * shipping.** `check()` read one array out of `schema.json` and enforced nothing else, so
   * a capability with `when: 'not an object'` registered, `supports()` destructured the
   * string to four `undefined` clauses and answered `true`, and the sequence went into the
   * pipe. `shape.ts` is the walk that closes it: **2,500 B**, plus 120 B in `capability.ts`
   * and 66 B of fail-safe in `supports.ts` — 2,686 B against 1,465 B of headroom.
   *
   * Bytes were found before the ceiling moved, and the trade is recorded so it is checkable.
   * The walk went 2,661 B → 1,967 B (one message per rule instead of two; `const` and `type`
   * share a sentence), `capability.ts` stopped rebuilding its record and its message table on
   * every call, and `plugin.ts` gave back 92 B by dropping the copy of `fallback`-is-required
   * it kept beside `capability.ts`'s. It then went **back up to 2,500 B** because
   * `maintainability/cognitive-complexity` reads one function of 18 against a ceiling of 15,
   * so the walk is five named functions rather than one — a lint rule this repository enforces
   * bought 533 B, which is a trade worth writing down rather than quietly reversing.
   *
   * `.` measured **20,221 B** after that, against a ceiling *tighter* than the one it
   * replaced: 279 B of headroom where there had been 1,465.
   *
   * **Raised from 20,500 to 20,900 on 2026-09-20, for a module boundary rather than a
   * feature.** `paratext/term-img` needs the OSC 1337 record without the registry, so `IMAGE`
   * and `ImageOptions` moved out of `builtins.ts` and `ansi-escapes.ts` into `image.js` —
   * the same move `link.ts` made, and it costs the same kind of bytes: a new file with its
   * own import list, and two re-export lines to keep the published names where they were.
   * The root reaches it whole, so it pays **+399 B** (20,221 → 20,620) for a file it would
   * otherwise have inlined. The headroom is 280 B, which is where the last raise left it.
   */
  // **16,100 and 13,400 on 2026-09-22 — down from 20,900 and 18,000, having briefly gone up.**
  // The family plugin schema is one byte-identical file across every host, and it grew when
  // `linegauge` became the ninth; paratext imported the whole of it to read one definition,
  // `$defs.capability`, so every host's definitions rode in every paratext user's bundle and
  // these two budgets were first *raised* to 22,100 and 19,400 to absorb it. That was the wrong
  // answer and D-108 said why. paratext now imports a generated fragment of exactly that
  // definition — `capability.schema.json`, written by `scripts/schema-sync.mjs` and held to the
  // source by `plugin-schema-lock.test.ts` — and publishes the whole contract as data it does not
  // import. Measured 16,002 and 13,328: both entries are lighter than they were this morning.
  '.': { allow: [], budget: 16_100, denied: ['plugin.js'] },
  /**
   * OSC 8 alone, for a host that wants one clickable URL and not a plugin contract.
   * Measured **2,337 B**: `link.js` 768, `template.js` 774, `supports.js` 652,
   * `runtime.js` 143. The budget is deliberately close — this entry exists *because* of its
   * size, so a change that doubles it should have to say so here.
   */
  './link': { allow: [], budget: 3_000, denied: ['index.js', 'capability.js', 'builtins.js', 'plugin.js', 'ansi-escapes.js', 'schema.json'] },
  /**
   * The `terminal-link` façade. It reaches `link.js` for the `LINK` record and `supports`,
   * `runtime.js` for the process seam and `template.js` to render — the same graph `./link`
   * walks, plus its own file. It must never reach `index.js`: taking a drop-in hyperlink is
   * not a reason to register seven built-ins, which is the whole argument for `./link`
   * existing and applies here unchanged.
   */
  './terminal-link': { allow: [], budget: 6_000, denied: ['index.js', 'capability.js', 'builtins.js', 'plugin.js', 'ansi-escapes.js', 'schema.json'] },
  /**
   * The `term-img` façade. It reaches `image.js` for the `IMAGE` record and the field
   * arithmetic, `runtime.js` for the process seam and `template.js` to render — and, unlike
   * `./terminal-link`, it does *not* reach `link.js`, because OSC 1337 and OSC 8 are now two
   * records in two files. The deny-list is the same one, and for the same reason: taking a
   * drop-in `terminalImage` is not a reason to register seven built-ins.
   *
   * `index.js` matters twice over here. Reaching it would not only run `registerBuiltins()`
   * at import; it would pull `ansi-escapes.js`, whose own top-level `registerBuiltins()` is
   * the second copy of that side effect.
   *
   * Measured **4,362 B**: `term-img.js` 2,526, `image.js` 880, `template.js` 774,
   * `runtime.js` 182. Most of its own file is the five-terminal version table, which is the
   * part `term-img` pays two dependencies for.
   */
  './term-img': { allow: [], budget: 5_000, denied: ['index.js', 'capability.js', 'builtins.js', 'plugin.js', 'ansi-escapes.js', 'schema.json'] },
  /**
   * The plugin host: `validate`, `contributions`, `attach`, and the `capability.ts` it
   * delegates to, which is what pulls `schema.json`. Measured 15,116 B. It must never reach
   * `index.js` — registering a plugin is not a reason to register seven built-ins.
   *
   * Raised from 16,500 to 18,000 on 2026-09-16 for the schema walk — the same 2,686 B the
   * root pays, less the 92 B `plugin.ts` gave back by asking `capability.ts` for the refusal
   * and its code instead of hand-checking `fallback` itself. Measured **17,710 B**; 290 B of
   * headroom, where there were 1,384. The reasoning is written out on `.` above.
   */
  './plugin': { allow: [], budget: 13_400, denied: ['index.js', 'builtins.js', 'ansi-escapes.js'] },
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
