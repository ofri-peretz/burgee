/**
 * Differential testing (replz-compare intent): the same inputs through the base and the head, and
 * every output that changed, unless a person approved that exact change with a reason. A pass/fail
 * suite tolerates drift no test pinned; an old-versus-new diff does not. Noise a run always varies
 * (timings, paths, dates) is normalised away by patterns the config names, so a difference left is
 * one the change made.
 */
import { createHash } from 'node:crypto';

import { parse as parseYaml } from 'seniority/yaml';
import { array, number, object, optional, parse, string } from 'truefit';

/** One difference a person accepted: the input, the two outputs it was between, and why. */
export interface Approval {
  readonly input: string;
  readonly base: string;
  readonly head: string;
  readonly reason: string;
}

export interface CompareConfig {
  /** Run first in each tree, which may start without node_modules or a build. */
  readonly setup?: string | undefined;
  /** Run once per input, with the input on stdin and its path in `$REPLZ_INPUT`. */
  readonly command: string;
  /** The folder of inputs, under the repository: every file in it is one input. */
  readonly inputs: string;
  /** Regular expressions whose matches are replaced in both outputs before they are compared. */
  readonly normalize: readonly string[];
  readonly approved: readonly Approval[];
}

export const COMPARE = '.sdlc/replz/compare.yaml';

/**
 * A normalize pattern as a regular expression. The pattern comes from the repository's own config,
 * written by the people who run the comparison, not from the inputs it compares.
 */
// eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the repository's own config, not untrusted input
const patternOf = (source: string): RegExp => new RegExp(source, 'gu');

const text = string({ min: 1 });
/** The first twelve hex digits of an output's sha256: enough to tell outputs apart, short enough to paste. */
const DIGEST_CHARS = 12;
const digestField = string({ pattern: /^[0-9a-f]{12}$/ });

const SCHEMA = object(
  {
    setup: optional(text),
    command: text,
    inputs: text,
    normalize: optional(array(text)),
    approved: optional(array(object({ input: text, base: digestField, head: digestField, reason: text }, { unknown: 'strict' }))),
  },
  { unknown: 'strict' },
);

export const parseCompareConfig = (source: string, yaml: string): CompareConfig => {
  let document: unknown;
  try {
    document = parseYaml(yaml);
  } catch (error) {
    throw new Error(`${source} is not YAML: ${(error as Error).message}. fix: correct the YAML`, { cause: error });
  }
  const parsed = parse(SCHEMA, document);
  if (!parsed.ok) {
    const lines = parsed.issues.map((issue) => `  ${issue.path === '' ? '/' : issue.path}: ${issue.message}`).join('\n');
    throw new Error(`${source} is not a valid replz compare config:\n${lines}\nfix: correct each field named above`);
  }
  const value = parsed.value as { normalize?: string[]; approved?: Approval[] } & Omit<CompareConfig, 'normalize' | 'approved'>;
  // Stryker disable next-line ArrayDeclaration: equivalent, any one pattern the mutant adds compiles, so nothing throws
  for (const pattern of value.normalize ?? []) {
    try {
      patternOf(pattern);
    } catch (error) {
      throw new Error(`${source}: normalize pattern ${pattern} is not a regular expression: ${(error as Error).message}. fix: correct the pattern`, {
        cause: error,
      });
    }
  }
  return { ...value, normalize: value.normalize ?? [], approved: value.approved ?? [] };
};

/** What one tree printed for one input. */
export interface Output {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** The output as compared: its exit code and both streams, each match of a pattern replaced by `<n>`. */
export const normalised = (output: Output, patterns: readonly string[]): string => {
  const whole = `exit ${String(output.code)}\n--- stdout\n${output.stdout}\n--- stderr\n${output.stderr}`;
  return patterns.reduce((done, pattern, at) => done.replace(patternOf(pattern), `<${String(at)}>`), whole);
};

export const digest = (textOf: string): string => createHash('sha256').update(textOf).digest('hex').slice(0, DIGEST_CHARS);

/** The first line the two texts disagree on, counted from 1, and each side's version of it. */
export const firstDifference = (base: string, head: string): { readonly line: number; readonly base: string; readonly head: string } => {
  const a = base.split('\n');
  const b = head.split('\n');
  let at = 0;
  // Past the end of `a`, `a[at]` is undefined, so the loop stops where either side runs out.
  while (a[at] !== undefined && a[at] === b[at]) at += 1;
  return { line: at + 1, base: a[at] ?? '(end)', head: b[at] ?? '(end)' };
};

export interface Difference {
  readonly input: string;
  /** The digests to approve it by. */
  readonly base: string;
  readonly head: string;
  readonly at: ReturnType<typeof firstDifference>;
}

export interface CompareReport {
  readonly inputs: number;
  readonly same: number;
  /** Differences a person approved, by input. */
  readonly approved: readonly string[];
  /** Differences nobody approved: each fails the run. */
  readonly differs: readonly Difference[];
  /** Approvals that matched no difference: the outputs moved on, so the entry can go. */
  readonly stale: readonly Approval[];
}

/** Each input's two outputs, judged: the same, a difference a person approved, or a difference. */
export const judge = (
  runs: readonly { readonly input: string; readonly base: Output; readonly head: Output }[],
  config: Pick<CompareConfig, 'normalize' | 'approved'>,
): CompareReport => {
  const used = new Set<Approval>();
  const approved: string[] = [];
  const differs: Difference[] = [];
  for (const one of runs) {
    const base = normalised(one.base, config.normalize);
    const head = normalised(one.head, config.normalize);
    if (base === head) continue;
    const pair = { base: digest(base), head: digest(head) };
    const approval = config.approved.find((entry) => entry.input === one.input && entry.base === pair.base && entry.head === pair.head);
    if (approval === undefined) {
      differs.push({ input: one.input, ...pair, at: firstDifference(base, head) });
    } else {
      used.add(approval);
      approved.push(one.input);
    }
  }
  return {
    inputs: runs.length,
    same: runs.length - approved.length - differs.length,
    approved,
    differs,
    stale: config.approved.filter((entry) => !used.has(entry)),
  };
};

/** The report as a person reads it: the counts, then each difference with the entry that approves it. */
export const compareText = (report: CompareReport, refs: { readonly base: string; readonly head: string }): string => {
  const head = `${String(report.inputs)} input(s) through ${refs.base} and ${refs.head}: ${String(report.same)} the same, ${String(report.approved.length)} approved, ${String(report.differs.length)} changed`;
  const differs = report.differs.flatMap((one) => [
    '',
    `${one.input}: line ${String(one.at.line)} changed`,
    `  - ${one.at.base}`,
    `  + ${one.at.head}`,
    `  approve: { input: ${JSON.stringify(one.input)}, base: ${one.base}, head: ${one.head}, reason: <why> }`,
  ]);
  const stale = report.stale.map((entry) => `stale approval for ${entry.input} (${entry.base} -> ${entry.head}): no run matched it, so it can go`);
  return [head, ...differs, ...(stale.length === 0 ? [] : ['', ...stale])].join('\n');
};
