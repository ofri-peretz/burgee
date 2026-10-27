/**
 * `oxmutate/spec`: what a replay test imports to drive the code under test through a formal
 * model's traces.
 *
 * A spec oracle (spec-oracle.ts) asks a backend for traces of a model: Quint's `quint run --mbt`,
 * or a directory of ITF files any tool wrote (Apalache emits the same format). A replay test,
 * written once per modelled component, takes each trace, performs each step's action on the real
 * code, and asserts the model's state. Under oxmutate those tests run with each mutant armed, on a
 * verdict track of their own: a mutant a replay test catches is `killedBySpec`, whatever the
 * ordinary tests say about it.
 *
 *   import { loadTraces } from 'oxmutate/spec';
 *   const traces = loadTraces('save-restore');
 *   it.skipIf(traces.length === 0).each(traces)('replays $name', (trace) => { … });
 *
 * Outside an oxmutate run there are no traces, so the replay tests skip.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { env } from './runtime.js';

/** JSON map of oracle name → directory of `*.itf.json` traces, set by oxmutate for its servers. */
export const SPEC_TRACES_ENV = 'OXMUTATE_SPEC_TRACES';

export interface Step {
  /** The model action that produced this state (`mbt::actionTaken`); `init` for the first. */
  action: string;
  /** The nondeterministic choices the action made (`mbt::nondetPicks`), `None` as undefined. */
  picks: Record<string, unknown>;
  /** The model's variables after the action, ITF values decoded. */
  state: Record<string, unknown>;
}

export interface Trace {
  /** The trace file's name, which the report quotes as the counterexample. */
  name: string;
  steps: Step[];
}

const META = new Set(['#meta', 'mbt::actionTaken', 'mbt::nondetPicks']);

/**
 * ITF values as plain JavaScript: `#bigint` as a number (a bigint past 2^53), `#set` and `#tup`
 * as arrays, `#map` as a Map. A `JSON.parse` reviver, so it runs bottom-up with no recursion of
 * its own: children are already decoded when their parent is.
 */
function revive(_key: string, v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  if ('#bigint' in o) {
    const n = BigInt(String(o['#bigint']));
    return n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(n) : n;
  }
  if ('#set' in o) return o['#set'];
  if ('#tup' in o) return o['#tup'];
  if ('#map' in o) return new Map(o['#map'] as [unknown, unknown][]);
  return v;
}

/** One ITF value, decoded as in a trace file. */
export const decode = (v: unknown): unknown => JSON.parse(JSON.stringify(v), revive) as unknown;

const pick = (v: unknown): unknown => {
  if (!v || typeof v !== 'object' || !('tag' in v)) return v;
  const variant = v as { tag: string; value?: unknown };
  return variant.tag === 'Some' ? variant.value : undefined;
};

/** One ITF file as steps. */
export function readTrace(file: string): Trace {
  // Stryker disable next-line StringLiteral: without an encoding readFileSync returns a Buffer, which JSON.parse reads as UTF-8 text all the same
  const itf = JSON.parse(readFileSync(file, 'utf8'), revive) as { states: Record<string, unknown>[] };
  const steps = itf.states.map((s) => ({
    action: String(s['mbt::actionTaken'] ?? ''),
    picks: Object.fromEntries(Object.entries((s['mbt::nondetPicks'] ?? {}) as Record<string, unknown>).map(([n, p]) => [n, pick(p)])),
    state: Object.fromEntries(Object.entries(s).filter(([k]) => !META.has(k))),
  }));
  return { name: path.basename(file), steps };
}

/** The traces oxmutate generated for this oracle, in file order; none outside an oxmutate run. */
export function loadTraces(oracle: string): Trace[] {
  const dirs = env[SPEC_TRACES_ENV] ? (JSON.parse(env[SPEC_TRACES_ENV]) as Record<string, string>) : {};
  const dir = dirs[oracle];
  if (!dir) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.itf.json'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((f) => readTrace(path.join(dir, f)));
}
