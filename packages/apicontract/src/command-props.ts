/**
 * `apicontract props <contract>` (contract-properties R3, R4): property tests drawn from the
 * contract, run against apicontract's own validator, normaliser and classifier, with no server.
 * Exit 1 on any counterexample, printed with the seed that replays it and the smallest value found.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { defineCommand, ExitCode } from 'burgee';

import { type GitReader, noGit, readContract } from './command-diff.js';
import { MODES, type Mode, type Side, SIDES } from './diff-classify.js';
import { emitArbitraries } from './props-emit.js';
import { type Counterexample, PROPERTIES, type Report, runProps, type Subject } from './props-run.js';

const TEXT = Symbol.for('burgee.text');

/** Values per payload and property: the intent's default; the weekly lane raises it. */
export const DEFAULT_RUNS = 1000;
/** The most characters of a counterexample printed in text. */
const SHOWN = 300;
/** How many schemas a reported keyword names before the rest are counted. */
const NAMED = 3;
/** The widest property name, `round-trip`, and two spaces. */
const COLUMN = 'round-trip'.length;

export interface PropsCommandOptions {
  readonly cwd: string;
  readonly contract: string;
  readonly against?: string | undefined;
  readonly runs: number;
  readonly seed: number;
  readonly mode?: Mode | undefined;
  readonly side?: Side | undefined;
  /** Write the arbitraries module here. */
  readonly emit?: string | undefined;
  readonly git?: GitReader;
  readonly subject?: Partial<Subject>;
}

const cut = (value: unknown): string => {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text;
};

const line = (found: Counterexample): string[] => [`  ${found.property}  ${found.operation} ${found.payload}: ${found.detail}`, `    value: ${cut(found.value)}`];

export const toText = (report: Report, label: string, emitted: string | undefined): string => {
  const lines = [`${report.counterexamples.length === 0 ? 'ok' : 'failed'}: ${label}, ${String(report.runs)} run(s) per payload, seed ${String(report.seed)}`];
  for (const property of PROPERTIES) {
    const { checked, discarded, failed } = report.tallies[property];
    lines.push(`  ${property.padEnd(COLUMN)}  ${String(checked)} checked, ${String(discarded)} discarded, ${String(failed)} failed`);
  }
  if (report.counterexamples.length > 0) lines.push('', 'counterexamples (replay with the same --seed):', ...report.counterexamples.flatMap(line));
  if (report.reported.length > 0) {
    lines.push('', 'values made without these keywords, and kept only where the validator accepted them:');
    for (const { keyword, at } of report.reported) lines.push(`  ${keyword}  ${at.slice(0, NAMED).join(', ')}${at.length > NAMED ? ` and ${String(at.length - NAMED)} more` : ''}`);
  }
  if (report.skipped.length > 0) lines.push('', 'not checked:', ...report.skipped.map((skipped) => `  ${skipped.operation} ${skipped.payload}: ${skipped.reason}`));
  if (emitted !== undefined) lines.push('', `arbitraries written to ${emitted}`);
  return lines.join('\n');
};

export const props = (options: PropsCommandOptions): Record<string | symbol, unknown> => {
  const git = options.git ?? noGit;
  const side = readContract(options.contract, options.cwd, git);
  const against = options.against === undefined ? undefined : readContract(options.against, options.cwd, git).contract;
  const report = runProps(side.contract, { runs: options.runs, seed: options.seed, against, mode: options.mode, side: options.side, subject: options.subject });
  if (options.emit !== undefined) {
    const file = resolve(options.cwd, options.emit);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, emitArbitraries(side.contract, side.label).text);
  }
  const failed = report.counterexamples.length > 0;
  const data: Record<string | symbol, unknown> = {
    ...report,
    contract: side.label,
    ...(options.against === undefined ? {} : { against: options.against }),
    ...(options.emit === undefined ? {} : { emitted: options.emit }),
    // burgee N7: an idempotent command says whether it changed anything; only --emit writes.
    changed: options.emit !== undefined,
    ...(failed ? { exitCode: ExitCode.RUNTIME, fix: `each counterexample is a bug in the code its property names: replay it with --seed ${String(report.seed)}` } : {}),
  };
  data[TEXT] = () => toText(report, side.label, options.emit);
  return data;
};

// Stryker disable next-line StringLiteral: equivalent, `resolve('', name)` and `resolve('.', name)` are both the working directory
const HERE = '.';

/** A seed for a run that names none: printed, so the run replays. */
const freshSeed = (): number => Date.now() >>> 0;

export const command = defineCommand({
  name: 'props',
  description: 'Property tests drawn from the contract: validator agreement, round-trip, normalisation and diff soundness, with no server',
  effects: 'idempotent',
  examples: [
    { command: 'apicontract props openapi.yaml', description: 'the properties on every payload, 1000 values each' },
    { command: 'apicontract props new.yaml --against old.yaml --seed 7', description: 'also check that what diff calls compatible is, replayably' },
    { command: 'apicontract props openapi.yaml --emit test/arbitraries.ts --runs 0', description: 'write fast-check arbitraries for your own tests' },
  ],
  arguments: [{ name: 'contract', description: 'the contract: a file, or git:<ref>:<path>' }],
  options: {
    against: { type: 'string', description: 'the contract before, to check diff soundness against: a file, or git:<ref>:<path>', placeholder: 'old' },
    runs: { type: 'number', default: DEFAULT_RUNS, description: 'values drawn per payload and property', placeholder: 'n' },
    seed: { type: 'number', description: 'the seed to draw from (default: one from the clock, printed)', placeholder: 'n' },
    mode: { type: 'string', choices: MODES, description: 'the compatibility question soundness checks, as in diff (default backward)' },
    side: { type: 'string', choices: SIDES, description: 'whose code the question is about, as in diff (default caller)' },
    emit: { type: 'string', description: 'write the fast-check arbitraries to this file', placeholder: 'file' },
  },
  run: ({ args, options }) =>
    props({
      cwd: HERE,
      contract: args.contract,
      against: options.against,
      runs: options.runs as number,
      seed: (options.seed as number | undefined) ?? freshSeed(),
      mode: options.mode as Mode | undefined,
      side: options.side as Side | undefined,
      emit: options.emit,
    }),
});
