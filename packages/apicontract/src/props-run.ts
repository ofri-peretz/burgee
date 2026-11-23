/**
 * The four properties (contract-properties R3), run on every payload of a contract with no server:
 *
 * - `agreement`: a value made from the schema passes the validator, and the same value with one
 *   constraint broken fails it, at the place broken.
 * - `round-trip`: a valid value survives JSON text and back, equal and still valid.
 * - `normalise`: `normalise` gives the same schema run twice as once, and accepts and refuses the
 *   same values as the schema it rewrote.
 * - `soundness` (given the contract before): where `diff` calls a payload compatible, every value
 *   the old sender could send passes the new receiver, by `compat.qnt`'s direction rules.
 *
 * Each draw comes from one seeded source, so the printed seed replays the run. A counterexample is
 * shrunk to the smallest value that still fails where the failure can be checked without the
 * generator; a disagreement between the generator and the validator is shown as drawn.
 */

import { type Contract, type Payload } from './core/model.js';
import { type Mode, payloadRules, type Side } from './diff-classify.js';
import { type Comparison, compareContracts, pair } from './diff-contract.js';
import { canonical, isDict, normalise } from './diff-normalise.js';
import { type Draft, type Draw, drawFrom, make } from './props-generate.js';
import { draftOf, type Judge, rooted, validatorJudge } from './props-judge.js';
import { mutate } from './props-mutate.js';
import { randomFrom, type Random } from './props-random.js';
import { shrink } from './props-shrink.js';

export const PROPERTIES = ['agreement', 'round-trip', 'normalise', 'soundness'] as const;
export type Property = (typeof PROPERTIES)[number];

export interface Tally {
  /** Values the property was checked on. */
  checked: number;
  /** Values drawn without a keyword the generator reports, which the validator refused: not evidence either way. */
  discarded: number;
  failed: number;
}

export interface Counterexample {
  readonly property: Property;
  readonly operation: string;
  readonly payload: string;
  /** The smallest failing value found, or the schema, for a property about schemas. */
  readonly value: unknown;
  readonly detail: string;
}

/** A payload no value could be checked on, and why. */
export interface Skipped {
  readonly operation: string;
  readonly payload: string;
  readonly reason: string;
}

export interface Report {
  readonly seed: number;
  readonly runs: number;
  readonly tallies: Readonly<Record<Property, Tally>>;
  readonly counterexamples: readonly Counterexample[];
  /** Keywords values were made without, each with the schemas it was met in. */
  readonly reported: readonly { readonly keyword: string; readonly at: readonly string[] }[];
  readonly skipped: readonly Skipped[];
}

export type Compare = (old: Contract, nu: Contract, options: { mode: Mode; side: Side }) => Comparison;

/**
 * The code the properties hold to account. Each defaults to contractdiff's own; a test passes a
 * planted bug in one to show the property that catches it.
 */
export interface Subject {
  /** The validator for a document in a dialect; throws when it cannot read the document. */
  readonly validator: (document: unknown, draft: Draft) => Judge;
  readonly normalise: (schema: unknown) => unknown;
  readonly encode: (value: unknown) => string;
  readonly decode: (text: string) => unknown;
  readonly compare: Compare;
}

export const SUBJECT: Subject = { validator: validatorJudge, normalise, encode: (value) => JSON.stringify(value), decode: (text) => JSON.parse(text) as unknown, compare: compareContracts };

export interface PropsOptions {
  /** Values drawn per payload and property. */
  readonly runs: number;
  readonly seed: number;
  /** The contract before, for `soundness`. */
  readonly against?: Contract | undefined;
  readonly mode?: Mode | undefined;
  readonly side?: Side | undefined;
  /** The code under test, piece by piece; contractdiff's own where not given. */
  readonly subject?: Partial<Subject> | undefined;
}

/** The validator for a payload's schema, or the reason there is none. */
const judge = (subject: Subject, schema: unknown, document: unknown, draft: Draft): Judge | string => {
  try {
    return subject.validator(rooted(schema, document), draft);
  } catch (error) {
    return (error as Error).message;
  }
};

/** A value as JSON text; `undefined` as its name. */
const show = (value: unknown): string => String(JSON.stringify(value));

/** Whether an issue at `issue` is about the place `path`: the place itself, or a union around it. */
const covers = (issue: string, path: string): boolean => issue === path || path.startsWith(`${issue}/`);

interface Run {
  readonly subject: Subject;
  readonly random: Random;
  readonly runs: number;
  readonly tallies: ReadonlyMap<Property, Tally>;
  readonly counterexamples: Counterexample[];
  readonly reported: Map<string, Set<string>>;
  readonly skipped: Skipped[];
}

const tally = (run: Run, property: Property): Tally => run.tallies.get(property) as Tally;

const fail = (run: Run, counterexample: Counterexample): void => {
  tally(run, counterexample.property).failed += 1;
  // One per property and payload: the first, shrunk, says enough.
  const same = (found: Counterexample): boolean => found.property === counterexample.property && found.operation === counterexample.operation && found.payload === counterexample.payload;
  if (!run.counterexamples.some(same)) run.counterexamples.push(counterexample);
};

const drawIn = (run: Run, contract: Contract): Draw => drawFrom(run.random, contract.document, draftOf(contract));

const gather = (into: Map<string, Set<string>>, from: ReadonlyMap<string, ReadonlySet<string>>): void => {
  for (const [keyword, at] of from) into.set(keyword, new Set([...(into.get(keyword) ?? []), ...at]));
};

/** One payload under check: where it is, its validator, and its normalised schema's. */
interface Check {
  readonly where: { readonly operation: string; readonly payload: string };
  readonly schema: unknown;
  readonly own: Judge;
  readonly normal: Judge | string;
  readonly once: unknown;
}

/** `agreement` on a drawn value: whether it passes, and whether a broken copy fails where it was broken. Returns the values to check meaning on: none when the validator refused the value, else it and its broken copy, if one was made. */
const agreement = (run: Run, check: Check, draw: Draw, value: unknown): readonly unknown[] => {
  const { where, own } = check;
  if (!own.accepts(value)) {
    if (draw.exact) fail(run, { property: 'agreement', ...where, value, detail: `made from the schema, refused by the validator at ${own.paths(value).join(', ')}` });
    const counted = tally(run, 'agreement');
    if (draw.exact) counted.checked += 1;
    else counted.discarded += 1;
    return [];
  }
  tally(run, 'agreement').checked += 1;
  const mutant = draw.exact ? mutate(draw, check.schema, value) : undefined;
  if (mutant === undefined) return [value];
  const paths = own.paths(mutant.value);
  const at = mutant.path || '/';
  if (paths.length === 0) fail(run, { property: 'agreement', ...where, value: mutant.value, detail: `\`${mutant.keyword}\` broken at ${at}, and the validator accepted it` });
  else if (!paths.some((path) => covers(path, mutant.path))) fail(run, { property: 'agreement', ...where, value: mutant.value, detail: `\`${mutant.keyword}\` broken at ${at}, refused at ${paths.join(', ')} instead` });
  return [value, mutant.value];
};

const roundTrip = (run: Run, check: Check, value: unknown): void => {
  const { subject } = run;
  const { own } = check;
  tally(run, 'round-trip').checked += 1;
  const broken = (candidate: unknown): boolean => {
    const back = subject.decode(subject.encode(candidate));
    return canonical(back) !== canonical(candidate);
  };
  if (!broken(value)) return;
  fail(run, { property: 'round-trip', ...check.where, value: shrink(value, (candidate) => own.accepts(candidate) && broken(candidate)), detail: 'changed through JSON text and back' });
};

const sameMeaning = (run: Run, check: Check, values: readonly unknown[]): void => {
  const { own, normal } = check;
  if (typeof normal === 'string') return;
  tally(run, 'normalise').checked += 1;
  const differs = (candidate: unknown): boolean => own.accepts(candidate) !== normal.accepts(candidate);
  const found = values.find(differs);
  if (found === undefined) return;
  fail(run, { property: 'normalise', ...check.where, value: shrink(found, differs), detail: `the schema ${own.accepts(found) ? 'accepts' : 'refuses'} it and its normalised form does not: ${show(check.once)}` });
};

/** `agreement`, `round-trip` and `normalise` on one payload. */
const onPayload = (run: Run, contract: Contract, operation: string, payload: Payload): void => {
  const draft = draftOf(contract);
  const where = { operation, payload: payload.name };
  const { subject } = run;
  const own = judge(subject, payload.schema, contract.document, draft);
  if (typeof own === 'string') {
    run.skipped.push({ ...where, reason: own });
    return;
  }
  const once = subject.normalise(payload.schema);
  const twice = subject.normalise(once);
  if (canonical(twice) !== canonical(once)) fail(run, { property: 'normalise', ...where, value: payload.schema, detail: `normalising twice gives ${show(twice)}, once gives ${show(once)}` });
  const check: Check = { where, schema: payload.schema, own, normal: judge(subject, once, contract.document, draft), once };
  let made = false;
  for (let index = 0; index < run.runs; index += 1) {
    const draw = drawIn(run, contract);
    const drawn = make(draw, payload.schema);
    gather(run.reported, draw.reported);
    if (drawn === undefined) continue;
    made = true;
    const values = agreement(run, check, draw, drawn.value);
    if (values.length === 0) continue;
    roundTrip(run, check, drawn.value);
    sameMeaning(run, check, values);
  }
  if (!made) run.skipped.push({ ...where, reason: 'no value could be made from the schema: it accepts nothing, or only values behind a reported keyword' });
};

/** A payload the classifier calls compatible, and which way values must pass for that to be true. */
interface Sound {
  readonly operation: string;
  readonly payload: string;
  readonly rule: 'backward' | 'forward';
  readonly from: { readonly contract: Contract; readonly payload: Payload };
  readonly to: { readonly contract: Contract; readonly payload: Payload };
}

/** Every payload of an operation both contracts have that the classifier calls compatible, once per rule the question needs. */
const compatible = (run: Run, contracts: { readonly old: Contract; readonly nu: Contract }, question: { readonly mode: Mode; readonly side: Side }): Sound[] => {
  const { old, nu } = contracts;
  const comparison = run.subject.compare(old, nu, question);
  const flagged = (operation: string, payload: string): boolean =>
    comparison.findings.some((finding) => finding.operation === operation && (finding.payload === undefined || finding.payload === payload) && finding.verdict !== 'non-breaking');
  return pair(old.operations, nu.operations).flatMap(([before, after]) => {
    if (before === undefined || after === undefined) return [];
    return after.payloads.flatMap((payload) => {
      const previous = before.payloads.find((candidate) => candidate.name === payload.name);
      if (previous === undefined || flagged(after.id, payload.name)) return [];
      // BACKWARD: the new receiver accepts what the old sender sent. FORWARD: the old receiver accepts what the new sender sends.
      return payloadRules(payload.direction, question.mode, question.side).map((rule): Sound => {
        const sides = { old: { contract: old, payload: previous }, nu: { contract: nu, payload } };
        return { operation: after.id, payload: payload.name, rule, from: rule === 'backward' ? sides.old : sides.nu, to: rule === 'backward' ? sides.nu : sides.old };
      });
    });
  });
};

/** `soundness` on one compatible payload: the first value the sender may send and the receiver refuses, shrunk. */
const soundness = (run: Run, sound: Sound): void => {
  const { from, to, rule } = sound;
  const source = judge(run.subject, from.payload.schema, from.contract.document, draftOf(from.contract));
  const sink = judge(run.subject, to.payload.schema, to.contract.document, draftOf(to.contract));
  if (typeof source === 'string' || typeof sink === 'string') return;
  const fails = (candidate: unknown): boolean => source.accepts(candidate) && !sink.accepts(candidate);
  for (let index = 0; index < run.runs; index += 1) {
    const drawn = make(drawIn(run, from.contract), from.payload.schema);
    if (drawn === undefined || !source.accepts(drawn.value)) continue;
    tally(run, 'soundness').checked += 1;
    if (!fails(drawn.value)) continue;
    const value = shrink(drawn.value, fails);
    const [sender, receiver] = rule === 'backward' ? ['old', 'new'] : ['new', 'old'];
    fail(run, { property: 'soundness', operation: sound.operation, payload: sound.payload, value, detail: `called compatible (${rule}), but the ${sender} contract sends this and the ${receiver} one refuses it at ${sink.paths(value).join(', ')}` });
    return;
  }
};

export const runProps = (contract: Contract, options: PropsOptions): Report => {
  const run: Run = {
    subject: { ...SUBJECT, ...options.subject },
    random: randomFrom(options.seed),
    runs: options.runs,
    tallies: new Map(PROPERTIES.map((property) => [property, { checked: 0, discarded: 0, failed: 0 }])),
    counterexamples: [],
    reported: new Map(),
    skipped: [],
  };
  for (const operation of contract.operations) {
    // A `false` payload is one that is never sent, such as the body of a 204: there is nothing to draw.
    for (const payload of operation.payloads) if (payload.schema !== false) onPayload(run, contract, operation.id, payload);
  }
  if (options.against !== undefined) {
    for (const sound of compatible(run, { old: options.against, nu: contract }, { mode: options.mode ?? 'backward', side: options.side ?? 'caller' })) soundness(run, sound);
  }
  const reported = [...run.reported].map(([keyword, at]) => ({ keyword, at: [...at].sort() })).sort((a, b) => a.keyword.localeCompare(b.keyword, 'en'));
  return { seed: run.random.seed, runs: run.runs, tallies: Object.fromEntries(run.tallies) as Record<Property, Tally>, counterexamples: run.counterexamples, reported, skipped: run.skipped };
};
