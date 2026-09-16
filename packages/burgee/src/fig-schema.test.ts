/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * PLAN 2.5.3 — the emitted Fig spec is checked against Fig's own vocabulary.
 *
 * `fig-spec.test.ts` next door asserts the other half: that the spec and the parser describe
 * the same program. This file asserts the half that one cannot see — that the *keys* are keys
 * Fig declares, on the node types Fig declares them on. A snapshot pins a typo as firmly as it
 * pins a fact: rename `subcommands` to `subCommands` and the spec still matches itself, still
 * serialises, and silently offers nothing.
 *
 * ## Fig publishes no schema. Checked, rather than assumed
 *
 * The step asks for the spec to be validated "against Fig's own schema". **There is no such
 * schema**, and that is the finding rather than an obstacle. `@withfig/autocomplete-types` —
 * the package Fig points completion authors at — ships exactly four files at its latest
 * version, 1.31.0: `LICENSE`, `README.md`, `package.json` and `index.d.ts`. The contract is a
 * TypeScript namespace declaration, not JSON Schema, not JTD, not anything a validator reads
 * at runtime. It was last published 2024-05-08, and Fig itself is a closed app that no longer
 * ships.
 *
 * So the check is structural. The rest of this comment is what that does and does not buy.
 *
 * ## The allowed keys are not written from memory
 *
 * `fig-spec.test.ts` declined to check key names at all, and said why: *"writing the
 * allowed-key table from memory would be worse than not checking: a wrong allow-list rejects
 * valid specs and blesses invalid ones, and nobody would know which."* That objection is
 * right, and it is about **provenance** rather than about difficulty — so it is answered by
 * giving the table a provenance, not by giving up.
 *
 * {@link FIG_KEYS} was extracted mechanically from Fig's own `index.d.ts`, at the version and
 * file hash recorded on it. That is the `compat-oracle` idiom one layer down: the incumbent's
 * own artefact is the specification, copied with its version attached, rather than
 * paraphrased. The hash is what says whether the copy is still the thing it was copied from.
 *
 * **No dependency is added.** The table is forty-odd strings; the package is not installed,
 * not in `devDependencies`, and not in the lockfile. U1's "zero external dependencies" is
 * about what the graph contains, and this adds nothing to it.
 *
 * ## What this covers, and what it does not
 *
 * Covers: every key we emit is one Fig declares, on the node type we emit it on; `name` is
 * present and is a string or array of strings where Fig requires one; the container keys
 * (`subcommands`, `options`, `args`, `suggestions`) have the shapes Fig declares; and the
 * whole tree is walked, so a bad key three levels down is found.
 *
 * Does **not** cover: Fig's semantics beyond its key names and their outermost types. It will
 * not catch a `priority` outside Fig's 0–100 band, a `generators` entry whose `script` is
 * malformed, a `loadSpec` naming a spec that does not exist, or anything about how Fig's
 * parser behaves at runtime. Nothing here should be read as "this spec works in Fig" — only
 * as "this spec is not obviously not a Fig spec".
 */
import { describe, expect, it } from 'vitest';

import { renderFigSpec } from './completions.js';
import { defineCommand, defineProgram } from './index.js';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'say hello',
      options: { shout: { type: 'boolean' }, greeting: { type: 'string', choices: ['Hello', 'Hi'] } },
      run: () => 'ok',
    }),
    defineCommand({
      name: 'config',
      description: 'configuration',
      commands: [defineCommand({ name: 'get', description: 'read one', options: { raw: { type: 'boolean' } }, run: () => 'ok' })],
    }),
  ],
});

/** Whatever the renderer produced, typed as what it is: data of unverified shape. */
const spec = renderFigSpec(program) as unknown as Record<string, unknown>;

// ───── Fig's own vocabulary ──────────────────────────────────────────────────────────────

/**
 * The keys Fig declares, per node type.
 *
 * Source: `@withfig/autocomplete-types@1.31.0`, `package/index.d.ts`,
 * sha256 `37f6d1eec4c783163d8c8054c479ec6b9e81a805ac662630bff34e20799587b4`.
 * Re-derive with `npm view @withfig/autocomplete-types dist.tarball`, then read the members
 * of `interface Subcommand`, `interface Option`, `interface Arg` and `interface
 * BaseSuggestion` with comments stripped.
 *
 * `Subcommand` and `Option` both `extends BaseSuggestion`, so each set is that interface's own
 * members **plus** {@link BASE}. `Arg` extends nothing and gets its own list — the asymmetry is
 * Fig's, and reproducing it is the point of copying rather than guessing: an `Arg` has no
 * `priority` and no `displayName`, and an allow-list that handed it both would bless a spec
 * Fig ignores.
 */
const BASE = [
  'displayName', 'insertValue', 'replaceValue', 'description', 'icon',
  'isDangerous', 'priority', 'hidden', 'deprecated', 'previewComponent', '_internal',
] as const;

const FIG_KEYS = {
  subcommand: new Set<string>([
    ...BASE,
    'name', 'subcommands', 'requiresSubcommand', 'options', 'args', 'filterStrategy',
    'additionalSuggestions', 'loadSpec', 'generateSpec', 'generateSpecCacheKey',
    'parserDirectives', 'cache',
  ]),
  option: new Set<string>([
    ...BASE,
    'name', 'args', 'isPersistent', 'isRequired', 'requiresEquals', 'requiresSeparator',
    'isRepeatable', 'exclusiveOn', 'dependsOn',
  ]),
  arg: new Set<string>([
    'name', 'description', 'isDangerous', 'suggestions', 'template', 'generators',
    'filterStrategy', 'suggestCurrentToken', 'isVariadic', 'optionsCanBreakVariadicArg',
    'isOptional', 'isCommand', 'isScript', 'isModule', 'debounce', 'default', 'loadSpec',
    'parserDirectives',
  ]),
} as const;

type Kind = keyof typeof FIG_KEYS;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Fig's `SingleOrArray<string>`, which is what `Subcommand.name` and `Option.name` are. */
const isStringOrStringArray = (v: unknown): boolean =>
  (typeof v === 'string' && v !== '') || (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string'));

/** One node to look at: the value, what it is supposed to be, and how we got to it. */
interface Visit {
  value: unknown;
  kind: Kind;
  path: string;
}

/** The keys whose values are more nodes, and what kind of node each holds. */
const CHILDREN = [
  ['subcommands', 'subcommand'],
  ['options', 'option'],
  ['args', 'arg'],
] as const;

/** `name`, which is the only required key and is spelled differently on an `Arg`. */
function nameViolations(node: Record<string, unknown>, kind: Kind, path: string): string[] {
  // An `Arg`'s `name` is optional and a plain string — Fig says so explicitly, and says it is
  // never used for parsing. A subcommand's and an option's are required and parse-significant.
  if (kind === 'arg') {
    return node['name'] === undefined || typeof node['name'] === 'string' ? [] : [`${path}: an arg's 'name' is a plain string`];
  }
  return isStringOrStringArray(node['name']) ? [] : [`${path}: a ${kind} needs a 'name' that is a non-empty string or array of strings`];
}

/** `suggestions`, which is `(string | Suggestion)[]` and only exists on an `Arg`. */
function suggestionViolations(node: Record<string, unknown>, kind: Kind, path: string): string[] {
  const suggestions = node['suggestions'];
  if (kind !== 'arg' || suggestions === undefined) return [];
  if (!Array.isArray(suggestions)) return [`${path}: 'suggestions' is an array`];
  return suggestions.flatMap((s, i) => (typeof s === 'string' || isRecord(s) ? [] : [`${path}.suggestions[${i}]: expected a string or a suggestion object`]));
}

/**
 * One node's own faults, plus the nodes reachable from it.
 *
 * Split from the walk so that neither half is long enough to hide anything, and so the walk
 * below can stay a flat loop.
 */
function nodeViolations(visit: Visit): { found: string[]; next: Visit[] } {
  const { value, kind, path } = visit;
  if (!isRecord(value)) return { found: [`${path}: expected a ${kind} object, got ${Array.isArray(value) ? 'an array' : typeof value}`], next: [] };

  const found = [
    ...Object.keys(value).filter((k) => !FIG_KEYS[kind].has(k)).map((k) => `${path}: '${k}' is not a key Fig declares on a ${kind}`),
    ...nameViolations(value, kind, path),
    ...(value['description'] === undefined || typeof value['description'] === 'string' ? [] : [`${path}: 'description' is a string`]),
    ...suggestionViolations(value, kind, path),
  ];

  const next: Visit[] = [];
  for (const [key, childKind] of CHILDREN) {
    const held = value[key];
    if (held === undefined) continue;
    // `args` is Fig's `SingleOrArray<Arg>`: one object or a list. `subcommands` and `options`
    // are lists only, so a bare object there is a fault rather than a shorthand.
    if (!Array.isArray(held)) {
      if (key !== 'args') found.push(`${path}: '${key}' is an array`);
      else next.push({ value: held, kind: childKind, path: `${path}.args[0]` });
      continue;
    }
    held.forEach((child, i) => next.push({ value: child, kind: childKind, path: `${path}.${key}[${i}]` }));
  }
  return { found, next };
}

/**
 * Every way `root` fails to look like a Fig node of `kind`, as sentences naming where.
 *
 * A list rather than a throw: this is handed deliberately broken objects by the suite below,
 * and a checker that stopped at the first problem could not be shown to have found the second.
 *
 * Iterative, for the reason `fig-spec.test.ts` gives about its own walk — an unbounded
 * recursion over externally-shaped data is what `secure-coding/no-unchecked-loop-condition`
 * refuses, and a spec is exactly that once this function is pointed at something it did not
 * generate.
 */
export function figViolations(root: unknown, kind: Kind, path = '<root>'): string[] {
  const out: string[] = [];
  const queue: Visit[] = [{ value: root, kind, path }];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const visit = queue.pop() as Visit;
    // A spec we generated is a tree, but a spec handed to us may not be: a cycle would other-
    // wise be an infinite loop in a checker whose whole job is to survive bad input.
    if (isRecord(visit.value)) {
      if (seen.has(visit.value)) continue;
      seen.add(visit.value);
    }
    const { found, next } = nodeViolations(visit);
    out.push(...found);
    queue.push(...next);
  }
  return out;
}

describe('the emitted spec uses Fig’s own vocabulary', () => {
  it('has no key Fig does not declare, anywhere in the tree', () => {
    expect(figViolations(spec, 'subcommand')).toEqual([]);
  });

  it('reaches the whole tree, so a nested node is actually inspected', () => {
    // Otherwise the assertion above could be green because the walk stopped at the root, which
    // is the way a recursive checker most often lies. `config get` is three levels down.
    const broken = structuredClone(spec) as Record<string, unknown>;
    const config = (broken['subcommands'] as Record<string, unknown>[]).find((c) => c['name'] === 'config');
    ((config?.['subcommands'] as Record<string, unknown>[])[0] as Record<string, unknown>)['nmae'] = 'get';
    expect(figViolations(broken, 'subcommand').join('\n')).toContain("subcommands[0]: 'nmae' is not a key Fig declares");
  });
});

/**
 * The half that makes the half above worth having.
 *
 * A validator is only evidence once it has been shown to refuse something. Each case starts
 * from the spec the renderer actually produced and breaks one field, so a fixture cannot drift
 * away from the thing under test — and the first case is the `subCommands` typo that
 * `fig-spec.test.ts`'s own doc comment names as the mistake a snapshot blesses.
 */
describe('and refuses a spec that does not', () => {
  const broken: [string, () => unknown, string][] = [
    ['a misspelled container key', () => ({ ...spec, subCommands: spec['subcommands'] }), "'subCommands' is not a key Fig declares"],
    ['a key borrowed from another node type', () => ({ ...spec, isVariadic: true }), "'isVariadic' is not a key Fig declares on a subcommand"],
    ['an arg given a subcommand-only key', () => ({ ...spec, args: { name: 'x', priority: 50 } }), "'priority' is not a key Fig declares on a arg"],
    ['a missing name', () => { const { name: _drop, ...rest } = spec; return rest; }, "needs a 'name'"],
    ['a name of the wrong type', () => ({ ...spec, name: 42 }), "needs a 'name'"],
    ['an empty name', () => ({ ...spec, name: '' }), "needs a 'name'"],
    ['a description of the wrong type', () => ({ ...spec, description: ['no'] }), "'description' is a string"],
    ['a container that is not a list', () => ({ ...spec, options: { '--x': true } }), "'options' is an array"],
    ['a node that is not an object at all', () => ({ ...spec, subcommands: ['greet'] }), 'expected a subcommand object, got string'],
  ];

  it.each(broken)('refuses %s, and says which node and which key', (_label, breakIt, expected) => {
    expect(figViolations(breakIt(), 'subcommand').join('\n')).toContain(expected);
  });

  it('is not simply refusing everything', () => {
    // The failure mode of an allow-list is rejecting valid input, which no case above can see.
    // Fig's own optional keys, on the node types Fig declares them on, must pass.
    const rich = {
      ...spec,
      priority: 76,
      hidden: false,
      requiresSubcommand: true,
      args: { name: 'path', isOptional: true, suggestions: ['a', { name: 'b' }] },
    };
    expect(figViolations(rich, 'subcommand')).toEqual([]);
  });
});
