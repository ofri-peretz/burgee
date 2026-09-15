/**
 * `--explain`, as **one record with three renderings** (R4, Y5).
 *
 * The record is the product. Human text, `--json` and the agent event are projections of it,
 * computed here and nowhere else — which is the whole content of Y5: a structured result
 * that a program renders, rather than a string a program has to parse back. The foundation
 * four have no equivalent, and the reason it is cheap is in R2: the resolver already walked
 * every source to pick a winner, so this is a read of what it recorded, not a second pass.
 *
 * **Why `explain` still returns text.** 0.1.0 shipped `explain(name, resolution): string` and
 * people print it; changing its return type would break every caller to buy a name. So the
 * record is `explanation()` and the text is `renderExplanation()` — and `explain` is now
 * literally `renderExplanation(explanation(…))`, which is what
 * `explain.test.ts` asserts byte for byte. Same decision as R14, for the same reason:
 * the shipped spelling is a value users have, and a design is not a reason to take it away.
 */
/**
 * **This file imports nothing.** The two shapes it reads — a candidate and a resolution —
 * are declared structurally, so `precedence.ts` can import this one without a cycle and a
 * caller with its own candidate type can render it. Types erase; a structural declaration
 * costs a reader one screen and buys a module graph with one direction.
 */

/** A candidate as this file reads it — `precedence.ts`'s `Candidate` satisfies it by having these. */
export interface ExplainedCandidate {
  source: string;
  location: string;
  value: unknown;
  line?: number;
}

/** A resolution as this file reads it: the candidate list per option, in `ORDER`. */
export interface ExplainedResolution {
  candidates: Record<string, ExplainedCandidate[]>;
}

export interface Explanation {
  /** The option asked about. */
  key: string;
  /** False when the command declares no such option — different from "declared and unset". */
  declared: boolean;
  /** The resolved value, or `undefined` when no source set one. */
  value: unknown;
  /** The candidate that won, or `undefined` when none did. */
  winner?: ExplainedCandidate;
  /** Every candidate, in `ORDER`. The truth table for this one option. */
  candidates: ExplainedCandidate[];
  /** Candidates that set a value and were outranked. */
  lost: ExplainedCandidate[];
  /**
   * Candidates that were consulted and had nothing. Kept apart from `lost` because
   * "the config file says `lib` and the flag beat it" and "there is no config file" are
   * different answers, and `--explain` exists to tell them apart.
   */
  unset: ExplainedCandidate[];
}

/** The record. Everything else in this file renders it. */
export function explanation(key: string, resolution: ExplainedResolution): Explanation {
  const candidates = resolution.candidates[key];
  if (candidates === undefined) return { key, declared: false, value: undefined, candidates: [], lost: [], unset: [] };
  const winner = candidates.find((c) => c.value !== undefined);
  const rest = candidates.filter((c) => c !== winner);
  return {
    key,
    declared: true,
    value: winner?.value,
    ...(winner === undefined ? {} : { winner }),
    candidates,
    lost: rest.filter((c) => c.value !== undefined),
    unset: rest.filter((c) => c.value === undefined),
  };
}

/**
 * One candidate in words.
 *
 * The `default` branch is R13's whole cost: a source seniority has never heard of renders
 * from what the plugin declared about itself, so `--explain` names a plugin's provenance
 * without this package knowing the plugin exists.
 */
export function describeCandidate(c: { source: string; location: string; line?: number }): string {
  const at = c.line === undefined ? c.location : `${c.location}:${String(c.line)}`;
  switch (c.source) {
    case 'flag':
      return `flag ${at}`;
    case 'env':
      return `env ${at}`;
    case 'config':
      return `config file ${at}`;
    case 'package':
      return `package.json field in ${at}`;
    case 'default':
      return 'default';
    default:
      return `${c.source} ${at}`.trim();
  }
}

/** The human rendering — what `explain()` returns and a terminal prints. */
export function renderExplanation(e: Explanation): string {
  if (!e.declared) return `${e.key} is not an option of this command\n`;
  const head = e.winner === undefined ? `${e.key} is unset` : `${e.key} = ${JSON.stringify(e.winner.value)}   from ${describeCandidate(e.winner)}`;
  const rest = e.candidates
    .filter((c) => c !== e.winner)
    .map((c) => `${describeCandidate(c)} ${c.value === undefined ? '(unset)' : JSON.stringify(c.value)}`);
  return `${head}\n${rest.length === 0 ? '' : `         candidates: ${rest.join(', ')}\n`}`;
}

export interface ExplanationCandidateJson {
  source: string;
  location: string;
  line?: number;
  set: boolean;
  value?: unknown;
}

export interface ExplanationJson {
  option: string;
  value?: unknown;
  source?: string;
  location?: string;
  line?: number;
  candidates: ExplanationCandidateJson[];
}

/** The `--json` rendering: the same record, with `set` spelled out rather than inferred from a missing key. */
export function explanationJson(e: Explanation): ExplanationJson {
  const { winner } = e;
  return {
    option: e.key,
    ...(winner === undefined
      ? {}
      : {
          value: winner.value,
          source: winner.source,
          location: winner.location,
          ...(winner.line === undefined ? {} : { line: winner.line }),
        }),
    candidates: e.candidates.map((c) => ({
      source: c.source,
      location: c.location,
      ...(c.line === undefined ? {} : { line: c.line }),
      set: c.value !== undefined,
      ...(c.value === undefined ? {} : { value: c.value }),
    })),
  };
}

export interface ExplanationEvent {
  event: 'config.explain';
  data: ExplanationJson;
}

/** The agent rendering: the family's `{ event, data }` envelope over the same projection. */
export function explanationEvent(e: Explanation): ExplanationEvent {
  return { event: 'config.explain', data: explanationJson(e) };
}
