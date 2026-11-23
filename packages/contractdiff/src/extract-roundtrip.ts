/**
 * The round trip (apicontract-extract R2, R-RT): `extract(gen(spec))` equals `spec` once both are
 * normalised. It is the check that catches a generator and an extractor disagreeing, which neither
 * one's own tests can see.
 *
 * `equal` is structural, by JSON Pointer, on the comparison form: a rewrite that validates the same
 * values but is spelled another way is a difference. Given a reader, `ac-diff`'s
 * `compareContracts` also says whether the round trip broke the contract, which is the question a
 * user of the extracted spec asks.
 */
import { type Contract } from './core/model.js';
import { type Comparison, compareContracts } from './diff-contract.js';
import { normalise, type NormaliseOptions, stable } from './extract-normalise.js';
import { escape, isRecord } from './extract-standard.js';

/** One place where the two documents differ. */
export interface Difference {
  readonly pointer: string;
  /** `missing`: the spec has it and the round trip lost it; `unexpected`: the round trip added it. */
  readonly problem: 'missing' | 'unexpected' | 'different';
  readonly spec?: unknown;
  readonly extracted?: unknown;
}

export interface Roundtrip {
  readonly equal: boolean;
  readonly diff: readonly Difference[];
  /** What the extractor returned, normalised. */
  readonly extracted: unknown;
  /** The spec (old) against what came back (new), classified: only when a reader was given. */
  readonly comparison?: Comparison;
}

export interface RoundtripOptions extends NormaliseOptions {
  /** Reads a document into the model, e.g. a host's `read`; with it, the round trip is also classified. */
  readonly read?: (document: unknown) => Contract;
}

/** Every place where two JSON values differ, by JSON Pointer, in key order. */
export const differences = (spec: unknown, extracted: unknown, pointer = ''): Difference[] => {
  if (isRecord(spec) && isRecord(extracted)) {
    const inSpec = new Set(Object.keys(spec));
    const inExtracted = new Set(Object.keys(extracted));
    return [...new Set([...inSpec, ...inExtracted])].toSorted().flatMap((key): Difference[] => {
      const at = `${pointer}/${escape(key)}`;
      if (!inExtracted.has(key)) return [{ pointer: at, problem: 'missing', spec: spec[key] }];
      if (!inSpec.has(key)) return [{ pointer: at, problem: 'unexpected', extracted: extracted[key] }];
      return differences(spec[key], extracted[key], at);
    });
  }
  if (Array.isArray(spec) && Array.isArray(extracted) && spec.length === extracted.length) {
    return spec.flatMap((item, index) => differences(item, extracted[index], `${pointer}/${String(index)}`));
  }
  return stable(spec) === stable(extracted) ? [] : [{ pointer, problem: 'different', spec, extracted }];
};

/**
 * Generate code from `spec`, extract a spec back from that code, and compare the two. Each half
 * is a function, so a generator's files, a module already imported, or a host's `run` all fit.
 */
export const roundtrip = async <Generated>(
  spec: unknown,
  generate: (spec: unknown) => Generated | Promise<Generated>,
  extract: (generated: Generated) => unknown,
  options: RoundtripOptions = {},
): Promise<Roundtrip> => {
  const back = await extract(await generate(spec));
  const extracted = normalise(back, options);
  const diff = differences(normalise(spec, options), extracted);
  const { read } = options;
  return { equal: diff.length === 0, diff, extracted, ...(read === undefined ? {} : { comparison: compareContracts(read(spec), read(back)) }) };
};
