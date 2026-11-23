/**
 * `apicontract diff <old> <new>` (apicontract-diff spec.md R4, R5): what a contract change breaks,
 * for whom, under the mode chosen. Each side is a file or `git:<ref>:<path>`, read through the
 * same built-in adapters (`inputs.ts`), so an OpenAPI document, a JSON Schema, an AsyncAPI
 * document and an MCP snapshot are all diffed by one engine. Exit 1 on a breaking or unknown change; a
 * dangerous one is listed and fails the run only under `--dangerous-breaking`.
 *
 * It also holds a change to the decision written in the contract (apicontract-diff-decisions
 * spec.md R11, R12): `--decisions warn|error|off`, read from the base ref's config first.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { defineCommand, ExitCode } from 'burgee';
import { parse as parseYaml } from 'seniority/yaml';

import { type Contract } from './core/model.js';
import { MODES, type Mode, type Side, SIDES, type Verdict } from './diff-classify.js';
import { type Comparison, compareContracts, type Finding, overall, sortFindings, summaryOf } from './diff-contract.js';
import { checkDecisions, isDate, withDecisions } from './diff-decisions.js';
import { compareTransitive } from './diff-transitive.js';
import { applyUsage, parseUsage } from './diff-usage.js';
import { type BufAnnotation, type BufBreaking, breakingIn, bufIn, builtImages, type Level, LEVELS, refFix } from './input-buf.js';
import { builtinAdapters } from './inputs.js';
import { DECISION_SETTINGS, type DecisionSetting, decisionSettingOf, UsageError } from './run-config.js';

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
  /**
   * With `transitive`: more contracts after `new`, so the positionals read oldest first and the
   * last one is the new contract. A directory among the old ones stands for its files, in version order.
   */
  readonly more?: readonly string[] | undefined;
  /** A file saying which operations and members callers use (contractdiff-compat-depth R3). */
  readonly usage?: string | undefined;
  /** Compare the new contract with every past release given, not only the last (contractdiff-compat-depth R1). */
  readonly transitive?: boolean | undefined;
  readonly mode?: Mode | undefined;
  readonly side?: Side | undefined;
  /** Render SARIF 2.1.0 as the text output, for code scanning. */
  readonly sarif?: boolean | undefined;
  /** Write `.changeset/<hash>.md` bumping this package by the verdict. */
  readonly changeset?: string | undefined;
  /** How a change is held to the decision written in the contract. Wins over the config; default `warn`. */
  readonly decisions?: DecisionSetting | undefined;
  /** The date `x-sunset` is judged against, `YYYY-MM-DD`; default today's UTC date. Tests pin it. */
  readonly today?: string | undefined;
  /** Report dangerous changes as breaking (contractdiff-compat-depth R2). */
  readonly dangerousBreaking?: boolean | undefined;
  readonly git?: GitReader;
  /** The image text buf built for each protobuf source given (apicontract-protobuf R2), by spec. */
  readonly built?: ReadonlyMap<string, string> | undefined;
  /** What buf breaking reported at `--level` (apicontract-protobuf R3), counted beside the model's findings. */
  readonly breaking?: readonly Finding[] | undefined;
}

export interface Side_ {
  readonly label: string;
  /** The file a SARIF location names. */
  readonly file: string;
  readonly contract: Contract;
}

// Stryker disable next-line Regex: equivalent, `.+` already runs to the end
const GIT = /^git:(?<ref>[^:]+):(?<path>.+)$/;

/** Read one side: a file, or a file at a git ref, into the model through the first adapter that detects it. */
export const readContract = (spec: string, cwd: string, git: GitReader, built: ReadonlyMap<string, string> = new Map()): Side_ => {
  const match = GIT.exec(spec);
  const { ref, path } = (match?.groups ?? {}) as { ref?: string; path?: string };
  const file = path ?? spec;
  const text = built.get(spec) ?? (ref === undefined ? readFileSync(resolve(cwd, spec), 'utf8') : git(ref, file, cwd));
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

/** The comparison with buf's findings among its own, and the verdict the worse of the two. */
const withBreaking = (comparison: Comparison, breaking: readonly Finding[]): Comparison => {
  const findings = sortFindings([...comparison.findings, ...breaking]);
  const summary = summaryOf(findings);
  return { ...comparison, findings, summary, verdict: overall(summary) };
};

/** One buf breaking annotation as a breaking finding: buf's rule id, at its file and line, with its message. */
const findingOf = (annotation: BufAnnotation, level: Level): Finding => ({
  id: `buf:${annotation.type}`,
  scheme: 'buf',
  verdict: 'breaking',
  effect: 'narrows',
  operation: annotation.path,
  source: `${annotation.path}:${String(annotation.line)}`,
  document: 'new',
  direction: 'request',
  pointer: '',
  before: undefined,
  after: undefined,
  fix: `${annotation.message} (buf breaking at --level ${level}): restore what changed, or release it as a new major version`,
});

/**
 * buf breaking's findings for `--level` (apicontract-protobuf R3): both sides must read as
 * protobuf, the one format with a wire encoding, and neither may be at a git ref or one of releases.
 */
export const bufFindings = async (options: DiffOptions, level: Level, breaking: BufBreaking): Promise<readonly Finding[]> => {
  if (options.transitive === true) throw new UsageError('--level compares two contracts. fix: drop --transitive, or run diff --level against each release');
  const sides = [options.old, options.new];
  const atRef = sides.find((spec) => GIT.test(spec));
  if (atRef !== undefined) throw new UsageError(`cannot judge ${atRef} at --level: buf reads a ref itself. ${refFix(atRef)}`);
  for (const spec of sides) {
    const { format } = readContract(spec, options.cwd, noGit, options.built).contract;
    if (format !== 'protobuf') throw new UsageError(`--level judges the wire encoding, and ${spec} reads as ${format}. fix: pass protobuf on both sides (a .proto, a buf module, or the image buf builds), or drop --level`);
  }
  const annotations = await breaking(options.new, options.old, level, options.cwd);
  return annotations.map((annotation) => findingOf(annotation, level));
};

/** The width of the verdict column in text output: `non-breaking` and two spaces. */
const COLUMN = 'non-breaking'.length;
/** Hex digits of the changeset's content hash in its file name, as `changeset add` names its own. */
const HASH_DIGITS = 8;

const LEVEL: Readonly<Record<Verdict, string>> = { breaking: 'error', unknown: 'warning', dangerous: 'warning', 'non-breaking': 'note' };

const where = (finding: Finding): string => [finding.payload ?? '', finding.pointer].filter((part) => part !== '').join(' ');

/** A SARIF `artifactLocation.uri` is a URI reference: an absolute path as a `file:` URL, a relative one with `/`. */
export const uriOf = (file: string): string => (isAbsolute(file) ? pathToFileURL(file).href : file.replaceAll('\\', '/'));

const show = (value: unknown): string => (value === undefined ? '-' : JSON.stringify(value));

/** One SARIF result: a finding at its side's file and operation. `label` says what kind of finding it is. */
interface Files {
  readonly old: Pick<Side_, 'file'>;
  readonly nu: Pick<Side_, 'file'>;
  /** With `--transitive`: each past release's file, by its label. */
  readonly releases?: ReadonlyMap<string, string> | undefined;
}

/** The file a finding's location is in: the new side's, or the old side's it was found against. */
const fileOf = (finding: Finding, files: Files): string =>
  finding.document === 'new' ? files.nu.file : (files.releases?.get(finding.against as string) ?? files.old.file);

const resultOf = (finding: Finding, label: string, files: Files): object => ({
  ruleId: finding.id,
  level: LEVEL[finding.verdict],
  message: { text: `${label}: ${finding.operation} ${where(finding)} ${show(finding.before)} -> ${show(finding.after)}. fix: ${finding.fix}` },
  locations: [
    {
      physicalLocation: { artifactLocation: { uri: uriOf(fileOf(finding, files)) } },
      logicalLocations: [{ fullyQualifiedName: `${finding.source}${finding.payload === undefined ? '' : ` ${finding.payload}`}${finding.pointer}` }],
    },
  ],
});

/** SARIF 2.1.0: one result per finding, at the side's file and the finding's operation; a decision finding is a `warning` unless `--decisions error`. */
export const toSarif = (comparison: Comparison, old: Pick<Side_, 'file'>, nu: Pick<Side_, 'file'>, releases?: ReadonlyMap<string, string>): object => {
  const decisions = comparison.decisions ?? [];
  const ids = [...new Set([...comparison.findings, ...decisions].map((finding) => finding.id))].sort();
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: { driver: { name: 'apicontract diff', rules: ids.map((id) => ({ id })) } },
        results: [
          ...comparison.findings.map((finding) => resultOf(finding, finding.verdict, { old, nu, releases })),
          ...decisions.map((finding) => resultOf(finding, 'decision', { old, nu })),
        ],
      },
    ],
  };
};

/** The decision findings, after the changes: each with its fix line, whatever its level. */
const decisionLines = (decisions: readonly Finding[]): string[] => {
  if (decisions.length === 0) return [];
  const level = (decisions[0] as Finding).verdict === 'breaking' ? 'error' : 'warn';
  return [
    '',
    `decisions: ${String(decisions.length)} (--decisions ${level})`,
    ...decisions.flatMap((finding) => [
      `  ${level.padEnd(COLUMN)}  ${finding.id}  ${finding.operation}  ${where(finding)}  ${show(finding.before)} -> ${show(finding.after)}`,
      `  ${''.padEnd(COLUMN)}  fix: ${finding.fix}`,
    ]),
  ];
};

/** What `--transitive` and `--usage` add to a finding's line: the release it breaks, and who uses it. */
const notesOf = (finding: Finding): string =>
  [
    finding.against === undefined ? '' : `  (against ${finding.against})`,
    finding.note === undefined ? '' : `  (${finding.note})`,
    finding.usedBy === undefined ? '' : `  (used by ${finding.usedBy.join(', ')})`,
  ].join('');

/** What `--transitive` compared with, and the oldest release a breaking change breaks. */
const transitiveLine = (transitive: NonNullable<Comparison['transitive']>): string =>
  `against ${String(transitive.against.length)} release(s), oldest first: ${transitive.against.join(', ')}; oldest broken: ${transitive.oldestBroken ?? 'none'}`;

/** Text grouped by operation, each finding with its fix line. */
export const toText = (comparison: Comparison, old: string, nu: string): string => {
  const { summary, mode, side } = comparison;
  const decisions = comparison.decisions ?? [];
  if (comparison.findings.length === 0) return [`no changes between ${old} and ${nu}`, ...decisionLines(decisions)].join('\n');
  const lines = [
    `${comparison.verdict}: ${String(summary.breaking)} breaking, ${String(summary.unknown)} unknown, ${summary.dangerous > 0 ? `${String(summary.dangerous)} dangerous, ` : ''}${String(summary['non-breaking'])} non-breaking (--mode ${mode} --side ${side})`,
  ];
  const operations = [...new Set(comparison.findings.map((finding) => finding.operation))];
  if (comparison.transitive !== undefined) lines.push(transitiveLine(comparison.transitive));
  for (const operation of operations) {
    const findings = comparison.findings.filter((finding) => finding.operation === operation);
    lines.push('', `${operation}  ${(findings[0] as Finding).source}`);
    for (const finding of findings) {
      lines.push(`  ${finding.verdict.padEnd(COLUMN)}  ${finding.id}  ${where(finding)}  ${show(finding.before)} -> ${show(finding.after)}${notesOf(finding)}`);
      if (finding.verdict !== 'non-breaking') lines.push(`  ${''.padEnd(COLUMN)}  fix: ${finding.fix}`);
    }
  }
  return [...lines, ...decisionLines(decisions)].join('\n');
};

const BUMP: Readonly<Record<Verdict, string>> = { breaking: 'major', unknown: 'major', dangerous: 'minor', 'non-breaking': 'minor' };

/**
 * `.changeset/<hash>.md` bumping `pkg` by the verdict, and whether it is new; `undefined` when the
 * contract did not change. The name is the content's hash, so a file already there is this one.
 */
const writeChangeset = (
  cwd: string,
  pkg: string,
  comparison: Comparison,
  labels: { readonly old: string; readonly nu: string },
): { readonly file: string; readonly changed: boolean } | undefined => {
  const { old, nu } = labels;
  if (comparison.findings.length === 0) return undefined;
  const body = comparison.findings.filter((finding) => finding.verdict !== 'non-breaking').map((finding) => `- ${finding.verdict}: \`${finding.id}\` in ${finding.operation} ${where(finding)}`);
  const text = [`---`, `'${pkg}': ${BUMP[comparison.verdict]}`, `---`, '', `Contract changes from ${old} to ${nu}: ${comparison.verdict}.`, ...(body.length > 0 ? ['', ...body] : []), ''].join('\n');
  // Forward slashes on every platform: the path is reported, and `resolve` reads it on Windows too.
  const file = `.changeset/apicontract-diff-${createHash('sha256').update(text).digest('hex').slice(0, HASH_DIGITS)}.md`;
  if (existsSync(resolve(cwd, file))) return { file, changed: false };
  mkdirSync(resolve(cwd, '.changeset'), { recursive: true });
  writeFileSync(resolve(cwd, file), text);
  return { file, changed: true };
};

const CONFIG = 'apicontract.config.json';
/** The characters of `YYYY-MM-DD`. */
const DATE_LENGTH = 10;

/**
 * `diff.decisions` from the config at `ref`. A config that is not at that ref, or that cannot be
 * read as one, sets nothing: it is history this run cannot fix, and the next source down answers.
 */
const settingAt = (ref: string, cwd: string, git: GitReader): DecisionSetting | undefined => {
  // Stryker disable next-line BlockStatement: equivalent, an empty handler leaves the function returning the same undefined
  try { return decisionSettingOf(git(ref, CONFIG, cwd), CONFIG); } catch { return undefined; }
};

/**
 * How decisions are held (R11, R12): the flag, else the base ref's config, else the working tree's,
 * else `warn`. The base ref's wins over the working tree's so a change cannot loosen the check it is
 * judged by; only the flag, which lives in the CI file with its own owner, is above it.
 */
const settingFor = (options: DiffOptions, git: GitReader): DecisionSetting => {
  if (options.decisions !== undefined) return options.decisions;
  const { ref } = (GIT.exec(options.old)?.groups ?? {}) as { ref?: string };
  const atBase = ref === undefined ? undefined : settingAt(ref, options.cwd, git);
  const file = resolve(options.cwd, CONFIG);
  // Stryker disable next-line StringLiteral: equivalent, a level that is neither `error` nor `off` grades as `warn`
  return atBase ?? (existsSync(file) ? decisionSettingOf(String(readFileSync(file)), CONFIG) : undefined) ?? 'warn';
};

/** The date sunsets are judged against: the one given, checked, or today's UTC date. */
const todayOf = (given: string | undefined): string => {
  if (given === undefined) return new Date().toISOString().slice(0, DATE_LENGTH);
  if (!isDate(given)) throw new UsageError(`--today takes a real date as YYYY-MM-DD, not ${given}. fix: pass a date such as --today 2027-01-01`);
  return given;
};

/** Whether a verdict fails the run: a dangerous change is listed, and fails it only as `--dangerous-breaking` makes it breaking. */
const fails = (verdict: Verdict): boolean => verdict === 'breaking' || verdict === 'unknown';

/** What to do about a failed run: the changes' own fix, or, when only the decisions fail it, theirs. */
const fixOf = (changed: Verdict, verdict: Verdict): string =>
  !fails(changed)
    ? 'resolve each decision finding as its own fix line says, or run with `--decisions warn` while the contract catches up'
    : `make each ${verdict} change compatible as its own fix line says, or release it as a major version`;

/** A version-ordered listing: `v2` before `v10`, `1.9.0` before `1.10.0`. */
const VERSION_ORDER = new Intl.Collator('en', { numeric: true });
/** The files a directory of releases holds. */
const CONTRACT_FILE = /\.(?:json|ya?ml)$/u;

/** One old side as given: a file or `git:` spec, or a directory's contract files in version order. */
const releasesOf = (spec: string, cwd: string, built: ReadonlyMap<string, string>): string[] => {
  const path = resolve(cwd, spec);
  // A `git:` spec names no path here, and a buf module is one image, so each is one release as it is.
  if (built.has(spec) || !existsSync(path) || !statSync(path).isDirectory()) return [spec];
  return readdirSync(path)
    .filter((name) => CONTRACT_FILE.test(name))
    .sort(VERSION_ORDER.compare)
    .map((name) => join(spec, name));
};

/** The old sides, oldest first, and the new one: two positionals, or with `--transitive` as many as given. */
const sidesOf = (options: DiffOptions, git: GitReader): { readonly olds: readonly Side_[]; readonly nu: Side_ } => {
  const more = options.more ?? [];
  const built = options.built ?? new Map<string, string>();
  if (options.transitive !== true) {
    if (more.length > 0) throw new UsageError(`diff compares two contracts, and was given ${String(more.length + 2)}. fix: pass --transitive to compare the last one with each before it, oldest first`);
    return { olds: [readContract(options.old, options.cwd, git, built)], nu: readContract(options.new, options.cwd, git, built) };
  }
  const specs = [options.old, options.new, ...more];
  const olds = specs.slice(0, -1).flatMap((spec) => releasesOf(spec, options.cwd, built));
  if (olds.length === 0) throw new UsageError(`no contract to compare with: ${specs.slice(0, -1).join(', ')} holds no .json, .yaml or .yml file. fix: pass the past releases' files, oldest first`);
  return { olds: olds.map((spec) => readContract(spec, options.cwd, git, built)), nu: readContract(specs.at(-1) as string, options.cwd, git, built) };
};

/** The usage file, read. */
const usageOf = (file: string, cwd: string): ReturnType<typeof parseUsage> => {
  const path = resolve(cwd, file);
  if (!existsSync(path)) throw new UsageError(`there is no usage file ${file}. fix: pass the path of a JSON file that says which operations callers use, or an apicontract.map.json`);
  return parseUsage(String(readFileSync(path)), file);
};

/** The command's work, with the folder and the git reader as inputs so a test can give its own. */
export const diff = (options: DiffOptions): Record<string | symbol, unknown> => {
  const git = options.git ?? noGit;
  const { olds, nu } = sidesOf(options, git);
  const first = olds[0] as Side_;
  const last = olds.at(-1) as Side_;
  const compare = { mode: options.mode, side: options.side, dangerousBreaking: options.dangerousBreaking };
  // The decisions are held against the release right before this one: the one the change is made to.
  const latest = compareContracts(last.contract, nu.contract, compare);
  const compared = options.transitive === true ? compareTransitive(olds, nu.contract, compare) : latest;
  const used = options.usage === undefined ? compared : applyUsage(compared, usageOf(options.usage, options.cwd));
  const changes = options.breaking === undefined ? used : withBreaking(used, options.breaking);
  const level = settingFor(options, git);
  const today = todayOf(options.today);
  const comparison =
    level === 'off' ? { ...changes, decisions: [] } : withDecisions(changes, checkDecisions(last.contract, nu.contract, latest, { today, level, changeset: options.changeset !== undefined }), level);
  const sarif = options.sarif === true ? toSarif(comparison, last, nu, new Map(olds.map((side) => [side.label, side.file]))) : undefined;
  const old = first;
  const written = options.changeset === undefined ? undefined : writeChangeset(options.cwd, options.changeset, comparison, { old: old.label, nu: nu.label });
  const failed = fails(comparison.verdict);
  const data: Record<string | symbol, unknown> = {
    ...comparison,
    old: old.label,
    new: nu.label,
    ...(sarif === undefined ? {} : { sarif }),
    // burgee N7: an idempotent command says whether it changed anything.
    changed: written?.changed ?? false,
    ...(written === undefined ? {} : { changeset: written.file }),
    ...(failed
      ? {
          exitCode: ExitCode.RUNTIME,
          fix: fixOf(changes.verdict, comparison.verdict),
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
  // ponytail: `--changeset` writes a file, so the effect is really the idempotent one, and the
  // result already reports whether it wrote. The spine's test pins every effect; this follows it.
  effects: 'idempotent',
  examples: [
    { command: 'apicontract diff old.yaml new.yaml', description: 'what breaks for callers built on old.yaml' },
    { command: 'apicontract diff old.yaml new.yaml --mode full --sarif', description: 'both directions, for code scanning' },
    { command: 'apicontract diff releases/ openapi.yaml --transitive', description: 'what breaks for callers on any past release, the oldest named' },
  ],
  arguments: [
    { name: 'old', description: 'the contract before: a file, or git:<ref>:<path>' },
    { name: 'new', description: 'the contract after: a file, or git:<ref>:<path>' },
    { name: 'more', variadic: true, required: false, description: 'with --transitive: more contracts, oldest first; the last is the new one, and a directory stands for its files in version order' },
  ],
  options: {
    mode: { type: 'string', choices: MODES, description: 'backward: old peers keep working; forward: the side may move first; full: both (default backward)' },
    side: { type: 'string', choices: SIDES, description: 'whose code the question is about (default caller)' },
    sarif: { type: 'boolean', description: 'print SARIF 2.1.0 for code scanning instead of text' },
    changeset: { type: 'string', description: 'write .changeset/<hash>.md bumping this package by the verdict', placeholder: 'package' },
    decisions: {
      type: 'string',
      choices: DECISION_SETTINGS,
      description: 'hold a change to the decision written in the contract: warn (default; prints, exit code unchanged), error (fails the run) or off. Read from the base ref\'s apicontract.config.json first',
    },
    usage: { type: 'string', description: 'a JSON file of the operations and members callers use (or an apicontract.map.json): a breaking change nobody uses is non-breaking', placeholder: 'file' },
    transitive: { type: 'boolean', description: 'compare the last contract with every one before it, not only the last: findings say which release they break' },
    level: { type: 'string', choices: LEVELS, description: 'protobuf only: also judge the wire encoding with buf breaking at this category; its findings count as breaking' },
    dangerousBreaking: { type: 'boolean', description: 'report dangerous changes (a default changed, a value a reader may not expect) as breaking, so they fail the run' },
    today: { type: 'string', description: 'the date x-sunset is judged against (default: today, UTC)', placeholder: 'YYYY-MM-DD' },
  },
  run: async ({ args, options }) => {
    const sides: DiffOptions = {
      built: await builtImages([args.old, args.new, ...args.more], HERE, bufIn()),
      cwd: HERE,
      old: args.old,
      new: args.new,
      more: args.more,
      transitive: options.transitive,
      usage: options.usage,
      mode: options.mode as Mode | undefined,
      side: options.side as Side | undefined,
      sarif: options.sarif,
      changeset: options.changeset,
      decisions: options.decisions as DecisionSetting | undefined,
      today: options.today,
      dangerousBreaking: options.dangerousBreaking,
    };
    const level = options.level as Level | undefined;
    return diff(level === undefined ? sides : { ...sides, breaking: await bufFindings(sides, level, breakingIn()) });
  },
});
