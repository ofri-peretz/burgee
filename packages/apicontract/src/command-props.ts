/**
 * `contractdiff props <contract>` (contract-properties R3, R4): property tests drawn from the
 * contract, run against contractdiff's own validator, normaliser and classifier, with no server.
 * Exit 1 on any counterexample, printed with the seed that replays it and the smallest value found.
 * `--sarif` (R5) prints the counterexamples as SARIF 2.1.0, as `diff --sarif` does its findings.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { defineCommand, ExitCode } from 'burgee';

import { type GitReader, noGit, readContract, uriOf } from './command-diff.js';
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
  /** Render SARIF 2.1.0 as the text output, for code scanning. */
  readonly sarif?: boolean | undefined;
  readonly git?: GitReader;
  readonly subject?: Partial<Subject>;
}

const cut = (value: unknown): string => {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text;
};

const line = (found: Counterexample): string[] => [`  ${found.property}  ${found.operation} ${found.payload}: ${found.detail}`, `    value: ${cut(found.value)}`];

export const toText = (report: Report, label: string, emitted: string | undefined, wrote: boolean): string => {
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
  if (emitted !== undefined) lines.push('', wrote ? `arbitraries written to ${emitted}` : `arbitraries in ${emitted} already up to date`);
  return lines.join('\n');
};

/** SARIF 2.1.0: one `error` per counterexample, at the contract file and the operation and payload it was drawn for. */
export const toSarif = (report: Report, file: string): object => ({
  version: '2.1.0',
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  runs: [
    {
      tool: { driver: { name: 'contractdiff props', rules: PROPERTIES.map((property) => ({ id: `props/${property}` })) } },
      results: report.counterexamples.map((found) => ({
        ruleId: `props/${found.property}`,
        level: 'error',
        message: { text: `${found.property}: ${found.operation} ${found.payload}: ${found.detail}. value: ${cut(found.value)}. fix: replay with --seed ${String(report.seed)}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: uriOf(file) } }, logicalLocations: [{ fullyQualifiedName: `${found.operation} ${found.payload}` }] }],
      })),
    },
  ],
});

export const props = (options: PropsCommandOptions): Record<string | symbol, unknown> => {
  const git = options.git ?? noGit;
  const side = readContract(options.contract, options.cwd, git);
  const against = options.against === undefined ? undefined : readContract(options.against, options.cwd, git).contract;
  const report = runProps(side.contract, { runs: options.runs, seed: options.seed, against, mode: options.mode, side: options.side, subject: options.subject });
  let wrote = false;
  if (options.emit !== undefined) {
    const file = resolve(options.cwd, options.emit);
    const text = emitArbitraries(side.contract, side.label).text;
    // burgee N7: an idempotent command says whether it changed anything, so a module already as emitted is left alone.
    wrote = !existsSync(file) || readFileSync(file, 'utf8') !== text;
    if (wrote) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  }
  const failed = report.counterexamples.length > 0;
  const sarif = options.sarif === true ? toSarif(report, side.file) : undefined;
  const data: Record<string | symbol, unknown> = {
    ...report,
    contract: side.label,
    ...(options.against === undefined ? {} : { against: options.against }),
    ...(options.emit === undefined ? {} : { emitted: options.emit }),
    changed: wrote,
    ...(sarif === undefined ? {} : { sarif }),
    ...(failed ? { exitCode: ExitCode.RUNTIME, fix: `each counterexample is a bug in the code its property names: replay it with --seed ${String(report.seed)}` } : {}),
  };
  data[TEXT] = () => (sarif === undefined ? toText(report, side.label, options.emit, wrote) : JSON.stringify(sarif, undefined, 2));
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
    { command: 'contractdiff props openapi.yaml', description: 'the properties on every payload, 1000 values each' },
    { command: 'contractdiff props new.yaml --against old.yaml --seed 7', description: 'also check that what diff calls compatible is, replayably' },
    { command: 'contractdiff props openapi.yaml --emit test/arbitraries.ts --runs 0', description: 'write fast-check arbitraries for your own tests' },
    { command: 'contractdiff props openapi.yaml --seed 7 --sarif', description: 'counterexamples as SARIF, for code scanning' },
  ],
  arguments: [{ name: 'contract', description: 'the contract: a file, or git:<ref>:<path>' }],
  options: {
    against: { type: 'string', description: 'the contract before, to check diff soundness against: a file, or git:<ref>:<path>', placeholder: 'old' },
    runs: { type: 'number', default: DEFAULT_RUNS, description: 'values drawn per payload and property', placeholder: 'n' },
    seed: { type: 'number', description: 'the seed to draw from (default: one from the clock, printed)', placeholder: 'n' },
    mode: { type: 'string', choices: MODES, description: 'the compatibility question soundness checks, as in diff (default backward)' },
    side: { type: 'string', choices: SIDES, description: 'whose code the question is about, as in diff (default caller)' },
    emit: { type: 'string', description: 'write the fast-check arbitraries to this file', placeholder: 'file' },
    sarif: { type: 'boolean', description: 'print SARIF 2.1.0 for code scanning instead of text' },
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
      sarif: options.sarif as boolean | undefined,
    }),
});
