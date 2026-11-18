/**
 * `apicontract diff <old> <new>` (apicontract-diff spec.md R4, R5): what a contract change breaks,
 * for whom, under the mode chosen. Each side is a file or `git:<ref>:<path>`, read through the
 * same built-in adapters (`inputs.ts`), so an OpenAPI document, a JSON Schema, an AsyncAPI
 * document and an MCP snapshot are all diffed by one engine. Exit 1 on a breaking or unknown change.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { defineCommand, ExitCode } from 'burgee';
import { parse as parseYaml } from 'seniority/yaml';

import { type Contract } from './core/model.js';
import { MODES, type Mode, type Side, SIDES, type Verdict } from './diff-classify.js';
import { type Comparison, compareContracts, type Finding } from './diff-contract.js';
import { builtinAdapters } from './inputs.js';

const TEXT = Symbol.for('burgee.text');

/** Reads `<path>` as it was at `<ref>`, relative to `cwd`: what `git show <ref>:<path>` prints. */
export type GitReader = (ref: string, path: string, cwd: string) => string;

/**
 * The reader the command ships with until apicontract can spawn `git`: subprocesses are bellpull's
 * job in this repository (inline-implementation lock) and apicontract does not depend on it yet.
 */
export const noGit: GitReader = (ref, path) => {
  throw new Error(
    `cannot read \`git:${ref}:${path}\`: this build of apicontract does not run git. fix: \`git show ${ref}:${path} > old.yaml\` and diff that file`,
  );
};

export interface DiffOptions {
  /** The folder paths are relative to. */
  readonly cwd: string;
  readonly old: string;
  readonly new: string;
  readonly mode?: Mode | undefined;
  readonly side?: Side | undefined;
  /** Render SARIF 2.1.0 as the text output, for code scanning. */
  readonly sarif?: boolean | undefined;
  /** Write `.changeset/<hash>.md` bumping this package by the verdict. */
  readonly changeset?: string | undefined;
  readonly git?: GitReader;
}

interface Side_ {
  readonly label: string;
  /** The file a SARIF location names. */
  readonly file: string;
  readonly contract: Contract;
}

// Stryker disable next-line Regex: equivalent, `.+` already runs to the end
const GIT = /^git:(?<ref>[^:]+):(?<path>.+)$/;

/** Read one side: a file, or a file at a git ref, into the model through the first adapter that detects it. */
const read = (spec: string, cwd: string, git: GitReader): Side_ => {
  const match = GIT.exec(spec);
  const { ref, path } = (match?.groups ?? {}) as { ref?: string; path?: string };
  const file = path ?? spec;
  const text = ref === undefined ? readFileSync(resolve(cwd, spec), 'utf8') : git(ref, file, cwd);
  let document: unknown;
  try {
    // YAML 1.2 reads JSON too.
    document = parseYaml(text);
  } catch (error) {
    throw new Error(`cannot parse ${spec}: ${(error as Error).message}. fix: pass a JSON or YAML document`, { cause: error });
  }
  const found = Object.entries(builtinAdapters).find(([, adapter]) => adapter.detect(document));
  if (found === undefined) {
    throw new Error(`no input format reads ${spec}. fix: pass a document one of these reads: ${Object.keys(builtinAdapters).join(', ')}`);
  }
  return { label: spec, file, contract: found[1].read(document) };
};

/** The width of the verdict column in text output: `non-breaking` and two spaces. */
const COLUMN = 'non-breaking'.length;
/** Hex digits of the changeset's content hash in its file name, as `changeset add` names its own. */
const HASH_DIGITS = 8;

const LEVEL: Readonly<Record<Verdict, string>> = { breaking: 'error', unknown: 'warning', 'non-breaking': 'note' };

const where = (finding: Finding): string => [finding.payload ?? '', finding.pointer].filter((part) => part !== '').join(' ');

const show = (value: unknown): string => (value === undefined ? '-' : JSON.stringify(value));

/** SARIF 2.1.0: one result per finding, at the side's file and the finding's operation. */
export const toSarif = (comparison: Comparison, old: Pick<Side_, 'file'>, nu: Pick<Side_, 'file'>): object => {
  const ids = [...new Set(comparison.findings.map((finding) => finding.id))].sort();
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: { driver: { name: 'apicontract diff', rules: ids.map((id) => ({ id })) } },
        results: comparison.findings.map((finding) => ({
          ruleId: finding.id,
          level: LEVEL[finding.verdict],
          message: { text: `${finding.verdict}: ${finding.operation} ${where(finding)} ${show(finding.before)} -> ${show(finding.after)}. fix: ${finding.fix}` },
          locations: [
            {
              physicalLocation: { artifactLocation: { uri: (finding.document === 'old' ? old : nu).file } },
              logicalLocations: [{ fullyQualifiedName: `${finding.source}${finding.payload === undefined ? '' : ` ${finding.payload}`}${finding.pointer}` }],
            },
          ],
        })),
      },
    ],
  };
};

/** Text grouped by operation, each finding with its fix line. */
export const toText = (comparison: Comparison, old: string, nu: string): string => {
  const { summary, mode, side } = comparison;
  if (comparison.findings.length === 0) return `no changes between ${old} and ${nu}`;
  const lines = [
    `${comparison.verdict}: ${String(summary.breaking)} breaking, ${String(summary.unknown)} unknown, ${String(summary['non-breaking'])} non-breaking (--mode ${mode} --side ${side})`,
  ];
  const operations = [...new Set(comparison.findings.map((finding) => finding.operation))];
  for (const operation of operations) {
    const findings = comparison.findings.filter((finding) => finding.operation === operation);
    lines.push('', `${operation}  ${(findings[0] as Finding).source}`);
    for (const finding of findings) {
      lines.push(`  ${finding.verdict.padEnd(COLUMN)}  ${finding.id}  ${where(finding)}  ${show(finding.before)} -> ${show(finding.after)}`);
      if (finding.verdict !== 'non-breaking') lines.push(`  ${''.padEnd(COLUMN)}  fix: ${finding.fix}`);
    }
  }
  return lines.join('\n');
};

const BUMP: Readonly<Record<Verdict, string>> = { breaking: 'major', unknown: 'major', 'non-breaking': 'minor' };

/** `.changeset/<hash>.md` bumping `pkg` by the verdict; `undefined` when nothing changed. */
const writeChangeset = (cwd: string, pkg: string, comparison: Comparison, labels: { readonly old: string; readonly nu: string }): string | undefined => {
  const { old, nu } = labels;
  if (comparison.findings.length === 0) return undefined;
  const body = comparison.findings.filter((finding) => finding.verdict !== 'non-breaking').map((finding) => `- ${finding.verdict}: \`${finding.id}\` in ${finding.operation} ${where(finding)}`);
  const text = [`---`, `'${pkg}': ${BUMP[comparison.verdict]}`, `---`, '', `Contract changes from ${old} to ${nu}: ${comparison.verdict}.`, ...(body.length > 0 ? ['', ...body] : []), ''].join('\n');
  const file = join('.changeset', `apicontract-diff-${createHash('sha256').update(text).digest('hex').slice(0, HASH_DIGITS)}.md`);
  mkdirSync(resolve(cwd, '.changeset'), { recursive: true });
  writeFileSync(resolve(cwd, file), text);
  return file;
};

/** The command's work, with the folder and the git reader as inputs so a test can give its own. */
export const diff = (options: DiffOptions): Record<string | symbol, unknown> => {
  const git = options.git ?? noGit;
  const old = read(options.old, options.cwd, git);
  const nu = read(options.new, options.cwd, git);
  const comparison = compareContracts(old.contract, nu.contract, { mode: options.mode, side: options.side });
  const sarif = options.sarif === true ? toSarif(comparison, old, nu) : undefined;
  const changeset = options.changeset === undefined ? undefined : writeChangeset(options.cwd, options.changeset, comparison, { old: old.label, nu: nu.label });
  const failed = comparison.verdict !== 'non-breaking';
  const data: Record<string | symbol, unknown> = {
    ...comparison,
    old: old.label,
    new: nu.label,
    ...(sarif === undefined ? {} : { sarif }),
    ...(changeset === undefined ? {} : { changeset }),
    ...(failed
      ? {
          exitCode: ExitCode.RUNTIME,
          fix: `make each ${comparison.verdict} change compatible as its own fix line says, or release it as a major version`,
        }
      : {}),
  };
  data[TEXT] = () => (sarif === undefined ? toText(comparison, old.label, nu.label) : JSON.stringify(sarif, undefined, 2));
  return data;
};

/**
 * The folder the user ran the command in, as a path every `node:path` `resolve` turns into the
 * working directory. The process itself is named only by the program's bin (process-reference lock).
 */
// Stryker disable next-line StringLiteral: equivalent, `resolve('', name)` and `resolve('.', name)` are both the working directory
const HERE = '.';

export const command = defineCommand({
  name: 'diff',
  description: 'What a contract change breaks, and for whom, under the compatibility mode you pick',
  effects: 'read_only',
  examples: [
    { command: 'apicontract diff old.yaml new.yaml', description: 'what breaks for callers built on old.yaml' },
    { command: 'apicontract diff old.yaml new.yaml --mode full --sarif', description: 'both directions, for code scanning' },
  ],
  arguments: [
    { name: 'old', description: 'the contract before: a file, or git:<ref>:<path>' },
    { name: 'new', description: 'the contract after: a file, or git:<ref>:<path>' },
  ],
  options: {
    mode: { type: 'string', choices: MODES, description: 'backward: old peers keep working; forward: the side may move first; full: both (default backward)' },
    side: { type: 'string', choices: SIDES, description: 'whose code the question is about (default caller)' },
    sarif: { type: 'boolean', description: 'print SARIF 2.1.0 for code scanning instead of text' },
    changeset: { type: 'string', description: 'write .changeset/<hash>.md bumping this package by the verdict', placeholder: 'package' },
  },
  run: ({ args, options }) =>
    diff({ cwd: HERE, old: args.old, new: args.new, mode: options.mode as Mode | undefined, side: options.side as Side | undefined, sarif: options.sarif, changeset: options.changeset }),
});
