/**
 * `apicontract lint [spec…]` (apicontract-lint spec.md R1–R3, R8): a contract's form checked by
 * rules that are data, on every format the adapters read. Text grouped by file, `--json`, or
 * `--sarif`; every finding with its `fix:` line; exit 1 when any finding is at `error`. Every run
 * ends with what it checked, and each ruleset's score: the share of its checks that passed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { defineCommand, ExitCode } from 'burgee';
import { parse as parseYaml } from 'seniority/yaml';

import { uriOf } from './command-diff.js';
import { type Contract } from './core/model.js';
import { builtinAdapters } from './inputs.js';
import { type Level, lint, type Rule, type LintFinding, type LintInput, type LintResult } from './lint-engine.js';
import { DEFAULT_RULESETS, gitIn, historyOf, type History, type LintGit, type Resolved, RULESET_FILE, rulesetOfText, type RulesetChange, type Sources, sourcesOf } from './lint-history.js';
import { rules, rulesets } from './lint-rules.js';
import { type Since, sinceOf } from './lint-since.js';
import { type NotCarried, type ReadRuleset } from './lint-spectral.js';
import { countRun, type Idle, idleCutoff, idleDays, idleOf, statsOf } from './lint-stats.js';
import { type Config, ConfigError, loadConfig, UsageError } from './run-config.js';
import { loadPlugins } from './run-load.js';

const TEXT = Symbol.for('burgee.text');

/** A ruleset may be named with the product's prefix, as a config written for a later name would. */
const PREFIX = /^(?:apicontract|contractdiff):/u;
const PERCENT = 100;
/** The file `lint.rules` is read from. */
const CONFIG_FILE = 'apicontract.config.json';
const RULESETS = new Map(Object.entries(rulesets));
const RULES = new Map(Object.entries(rules));
/** The width of the level column in text output: `error` and two spaces. */
const COLUMN = 'error'.length;
/** `2026-11-23` of an ISO date. */
const DATE = 'yyyy-mm-dd'.length;

export interface LintOptions {
  readonly cwd: string;
  /** Files to lint; the config's `input` when empty. */
  readonly specs: readonly string[];
  /** Rulesets, over the config's `extends`. */
  readonly rulesets?: readonly string[] | undefined;
  readonly sarif?: boolean | undefined;
  /** The config, when the caller has read it; read from `cwd` otherwise. */
  readonly config?: Config | undefined;
  /** Read the config and its ruleset files at this ref, not the working tree (R11); `merge-base` is CI's base. */
  readonly rulesFrom?: string | undefined;
  /** git in the config's folder, when a test gives its own. */
  readonly git?: LintGit | undefined;
  /** The time warn-first counts from (R10), when a test gives its own. */
  readonly now?: Date | undefined;
  /** Lint in full only the operations added or changed since this ref (R12), over the config's `lint.since`. */
  readonly since?: string | undefined;
  /** Count this run into this JSON file, relative to `cwd` (R13). */
  readonly stats?: string | undefined;
  /** List the rules with no finding in this many days, `"90d"`, from `stats` (R13). */
  readonly idle?: string | undefined;
}

/** What `--stats` did: the file, whether this run was counted into it, and the idle rules when `--idle` asked. */
export interface Recorded {
  readonly file: string;
  /** False when this commit was counted already. */
  readonly counted: boolean;
  readonly idle?: readonly Idle[];
  readonly idleFor?: string;
}

export interface Score {
  readonly passed: number;
  readonly checked: number;
  /** Rounded down, so 99.9% never reads as 100%. */
  readonly percent: number;
}

/** Every ruleset file `names` lists, read from `root`, by its name. */
export const readRulesets = (names: readonly string[], root: string): Record<string, ReadRuleset> =>
  Object.fromEntries(names.filter((name) => RULESET_FILE.test(name)).map((name) => [name, rulesetOfText(name, () => readFileSync(resolve(root, name), 'utf8'), CONFIG_FILE)]));

/** A ruleset's levels by its name: a file read already, else a built-in one. */
const rulesetOf = (name: string, files: Readonly<Record<string, ReadRuleset>>): Readonly<Record<string, Level>> | undefined =>
  new Map(Object.entries(files)).get(name)?.levels ?? RULESETS.get(name.replace(PREFIX, ''));

/**
 * Each rule's level: the rulesets in order, a later one winning, then every rule a plugin
 * contributes at `warn` (installing it is asking for it), then the config's `rules`.
 */
export const levelsOf = (
  names: readonly string[],
  overrides: Readonly<Record<string, Level>> = {},
  contributed: Readonly<Record<string, Rule>> = {},
  files: Readonly<Record<string, ReadRuleset>> = {},
): Record<string, Level> => {
  const chosen = names.map((name) => {
    const ruleset = rulesetOf(name, files);
    if (ruleset === undefined) throw new UsageError(`there is no ruleset \`${name}\`. fix: use one of ${Object.keys(rulesets).join(', ')}, or a .spectral.yaml file`);
    return ruleset;
  });
  // The overrides come from the config, so a rule it misnames is a config to fix: exit 3, not 2 (R-A2).
  const known = new Set([...RULES.keys(), ...Object.values(files).flatMap((file) => Object.keys(file.rules)), ...Object.keys(contributed)]);
  const unknown = Object.keys(overrides).filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ConfigError(
      CONFIG_FILE,
      unknown.map((id) => `\`lint.rules\` names \`${id}\`, which is not a rule. fix: use one of ${[...known].sort().join(', ')}, or add the plugin that contributes it to \`plugins\``),
    );
  }
  const plugins = Object.fromEntries(Object.keys(contributed).map((id): [string, Level] => [id, 'warn']));
  return Object.fromEntries([...chosen, plugins, overrides].flatMap((levels) => Object.entries(levels)));
};

/** A ruleset's score on a run: how many of the checks its rules made passed. */
export const scoreOf = (ruleset: Readonly<Record<string, Level>>, counts: LintResult['counts']): Score => {
  const run = Object.keys(ruleset).flatMap((id) => (counts[id] === undefined ? [] : [counts[id]]));
  const checked = run.reduce((sum, count) => sum + count.checked, 0);
  const passed = checked - run.reduce((sum, count) => sum + count.failed, 0);
  return { passed, checked, percent: checked === 0 ? PERCENT : Math.floor((passed / checked) * PERCENT) };
};

/** A document's contract, by the first adapter that detects it. */
const contractOf = (document: unknown): Contract | undefined => Object.values(builtinAdapters).find((adapter) => adapter.detect(document))?.read(document);

/** One input read through the first adapter that detects it. */
export const readInput = (file: string, cwd: string): LintInput => {
  let document: unknown;
  try {
    // YAML 1.2 reads JSON too.
    document = parseYaml(readFileSync(resolve(cwd, file), 'utf8'));
  } catch (error) {
    throw new UsageError(`cannot read ${file}: ${(error as Error).message}. fix: pass a JSON or YAML document that exists`);
  }
  const contract = contractOf(document);
  if (contract === undefined) throw new UsageError(`no input format reads ${file}. fix: pass a document one of these reads: ${Object.keys(builtinAdapters).join(', ')}`);
  return { file, contract };
};

/** A document's text at a ref, as a contract: `undefined` when it does not parse or no adapter reads it, so it counts as new. */
export const contractAt = (text: string): Contract | undefined => {
  // Stryker disable next-line BlockStatement: equivalent, an empty handler returns the same undefined
  try { return contractOf(parseYaml(text)); } catch { return undefined; }
};

const LEVEL: Readonly<Record<LintFinding['level'], string>> = { error: 'error', warn: 'warning' };

/** SARIF 2.1.0: one result per finding, at its file and pointer. */
export const toSarif = (result: LintResult, all: Readonly<Record<string, Rule>> = rules): object => ({
  version: '2.1.0',
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  runs: [
    {
      tool: { driver: { name: 'apicontract lint', rules: Object.keys(result.counts).map((id) => ({ id, shortDescription: { text: (new Map(Object.entries(all)).get(id) as Rule).description } })) } },
      results: result.findings.map((finding) => ({
        ruleId: finding.rule,
        level: LEVEL[finding.level],
        message: { text: `${finding.message}. fix: ${finding.fix}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: uriOf(finding.file) } }, logicalLocations: [{ fullyQualifiedName: finding.pointer }] }],
      })),
    },
  ],
});

/** One rule change as the text says it. */
const changeOf = (change: RulesetChange): string => {
  if (change.from === change.to) return 'its definition changed';
  return `${change.from ?? 'not run'} → ${change.to ?? 'not run'}${change.definition ? ', and its definition changed' : ''}`;
};

/** The working tree's changes to the rules, not applied (R11), as a block before the findings. */
const changedLines = (history: Partial<History>): string[] => {
  const changed = history.changed ?? [];
  if (changed.length === 0) return [];
  return [
    `rules changed since ${history.from as string}, not applied`,
    ...changed.map((change) => `  ${'info'.padEnd(COLUMN)}  ruleset-changed  ${change.id}: ${changeOf(change)}`),
    `  ${''.padEnd(COLUMN)}  fix: merge the change first; until then the rules come from ${history.from as string}`,
    '',
  ];
};

/** What a run says beside its findings: the rules' history (R10, R11) and what `--since` skipped (R12). */
export type Notes = Partial<History> & { readonly since?: Since | undefined; readonly stats?: Recorded | undefined };

/** What `--since` did, for the coverage line. */
const sinceNote = (since: Since | undefined): string[] => {
  if (since === undefined) return [];
  return ['unapplied' in since ? `; since not applied: ${since.unapplied}` : `; since ${since.from}: ${String(since.skipped)} untouched operation(s) skipped`];
};

/** What `--stats` did, for the coverage line. */
const statsNote = (stats: Recorded | undefined): string[] => {
  if (stats === undefined) return [];
  return [`; stats: ${stats.counted ? 'this run counted in' : 'this commit already counted in'} ${stats.file}`, ...(stats.idle === undefined ? [] : [`; idle ${stats.idleFor as string}: ${String(stats.idle.length)}`])];
};

/** The rules `--idle` found idle, as a block before the findings. */
const idleLines = (stats: Recorded | undefined): string[] => {
  if (stats?.idle === undefined || stats.idle.length === 0) return [];
  return [
    `rules with no finding in ${stats.idleFor as string}`,
    ...stats.idle.map((entry) => `  ${'info'.padEnd(COLUMN)}  rule-idle  ${entry.id}: ${entry.found ? 'last found something' : 'has found nothing since its first run'} ${entry.since.slice(0, DATE)}, in ${String(entry.runs)} run(s)`),
    `  ${''.padEnd(COLUMN)}  fix: set each to "off" in \`lint.rules\` if what it guards cannot come back; keep it if it is a tripwire`,
    '',
  ];
};

/** Where the rules came from, what warns first and what `--since` skipped, for the coverage line. */
const historyNote = (history: Notes): string =>
  [
    ...(history.from === undefined ? [] : [`; rules from ${history.from}`]),
    ...(history.warnFirst === undefined || history.warnFirst.length === 0 ? [] : [`; warn first: ${String(history.warnFirst.length)} (${history.warnFirst.join(', ')})`]),
    ...(history.unchecked === undefined ? [] : [`; warn first not checked: ${history.unchecked}`]),
    ...sinceNote(history.since),
    ...statsNote(history.stats),
  ].join('');

/** Text grouped by file, then what was checked and each ruleset's score. */
export const toText = (result: LintResult, scores: Readonly<Record<string, Score>>, notCarried: readonly NotCarried[] = [], history: Notes = {}): string => {
  const lines: string[] = [...changedLines(history), ...idleLines(history.stats)];
  for (const file of [...new Set(notCarried.map((entry) => entry.file))]) {
    lines.push(file);
    for (const entry of notCarried.filter((each) => each.file === file)) lines.push(`  ${'warn'.padEnd(COLUMN)}  rule-not-carried  ${entry.pointer}  ${entry.id}: ${entry.reason}`, `  ${''.padEnd(COLUMN)}  fix: ${entry.fix}`);
    lines.push('');
  }
  for (const file of result.inputs) {
    const findings = result.findings.filter((finding) => finding.file === file);
    if (findings.length === 0) continue;
    lines.push(file);
    for (const finding of findings) lines.push(`  ${finding.level.padEnd(COLUMN)}  ${finding.rule}  ${finding.pointer}  ${finding.message}`, `  ${''.padEnd(COLUMN)}  fix: ${finding.fix}`);
    lines.push('');
  }
  const errors = result.findings.filter((finding) => finding.level === 'error').length;
  const nodes = Object.values(result.counts).reduce((sum, count) => sum + count.checked, 0);
  lines.push(
    `${String(errors)} error(s), ${String(result.findings.length - errors)} warning(s). Checked ${String(Object.keys(result.counts).length)} rule(s) on ${String(result.inputs.length)} input(s), ${String(nodes)} node(s); not carried: ${notCarried.length === 0 ? 'none' : `${String(notCarried.length)} (${notCarried.map((entry) => entry.id).join(', ')})`}${historyNote(history)}.`,
    ...Object.entries(scores).map(([name, score]) => `${name}: ${String(score.percent)}% (${String(score.passed)} of ${String(score.checked)} checks passed)`),
  );
  return lines.join('\n');
};

/** What `--json` says of the rules' history: each key only when it has something to say. */
const historyData = (history: History): Record<string, unknown> => ({
  ...(history.from === undefined ? {} : { rulesFrom: history.from, rulesetChanged: history.changed }),
  ...(history.warnFirst.length === 0 ? {} : { warnFirst: history.warnFirst }),
  ...(history.unchecked === undefined ? {} : { warnFirstUnchecked: history.unchecked }),
});

/** The rules a run's sources resolve to, with what the config's plugins contribute. */
const resolverOf =
  (contributed: Readonly<Record<string, Rule>>) =>
  (sources: Sources): Resolved => ({
    all: { ...rules, ...Object.assign({}, ...Object.values(sources.files).map((file) => file.rules)), ...contributed } as Record<string, Rule>,
    levels: levelsOf(sources.names, sources.overrides, contributed, sources.files),
  });

/** The rules `lint.legacy` names, each one a rule this run knows; a name that is not one is a config to fix. */
const legacyOf = (names: readonly string[], all: Readonly<Record<string, Rule>>): ReadonlySet<string> => {
  const known = new Set(Object.keys(all));
  const unknown = names.filter((id) => !known.has(id));
  if (unknown.length > 0) throw new ConfigError(CONFIG_FILE, unknown.map((id) => `\`lint.legacy\` names \`${id}\`, which is not a rule. fix: use one of ${[...known].sort().join(', ')}`));
  return new Set(names);
};

interface Read {
  readonly specs: readonly string[];
  /** The folder the specs are relative to, and the one git runs in. */
  readonly base: string;
  readonly root: string;
  readonly git: LintGit;
  readonly since: string | undefined;
}

/** Each spec read, with what it touched since `--since`'s ref when one is given (R12). */
const inputsOf = async (read: Read): Promise<{ readonly inputs: readonly LintInput[]; readonly since?: Since }> => {
  const inputs = read.specs.map((spec) => readInput(spec, read.base));
  if (read.since === undefined) return { inputs };
  return sinceOf({ git: read.git, ref: read.since, inputs: inputs.map((input) => ({ input, path: relative(read.root, resolve(read.base, input.file)) })), read: contractAt });
};

interface Count {
  readonly options: LintOptions;
  readonly result: LintResult;
  readonly git: LintGit;
  readonly now: Date;
}

/** `--idle`'s days, refused before anything runs: without `--stats` it has nothing to read. */
const idleOption = (options: LintOptions): number | undefined => {
  if (options.idle === undefined) return undefined;
  if (options.stats === undefined) throw new UsageError('`--idle` reads the counts `--stats` keeps. fix: add `--stats lint-stats.json`, a file your CI caches');
  return idleDays(options.idle);
};

/** The run counted into `--stats`'s file, once per commit (outside a repository, once per day), and the idle rules (R13). */
const recordOf = async ({ options, result, git, now }: Count, days: number | undefined): Promise<Recorded | undefined> => {
  if (options.stats === undefined) return undefined;
  const path = resolve(options.cwd, options.stats);
  // Stryker disable next-line StringLiteral: equivalent, `JSON.parse` reads a Buffer as its text
  const stats = statsOf(existsSync(path) ? readFileSync(path, 'utf8') : undefined, options.stats);
  const next = countRun(stats, result, { key: (await git.commit('HEAD')) ?? now.toISOString().slice(0, DATE), now });
  if (next !== stats) writeFileSync(path, `${JSON.stringify(next, undefined, 2)}\n`);
  return {
    file: options.stats,
    counted: next !== stats,
    ...(days === undefined ? {} : { idle: idleOf(next, Object.keys(result.counts), idleCutoff(days, now)), idleFor: options.idle as string }),
  };
};

interface Done {
  readonly result: LintResult;
  readonly scores: Readonly<Record<string, Score>>;
  readonly notCarried: readonly NotCarried[];
  readonly notes: History & { readonly since?: Since | undefined; readonly stats?: Recorded | undefined };
  readonly sarif: object | undefined;
}

/** What a run returns: its data for `--json`, its text, and exit 1 when any finding is at `error`. */
const dataOf = ({ result, scores, notCarried, notes, sarif }: Done): Record<string | symbol, unknown> => {
  const errors = result.findings.filter((finding) => finding.level === 'error').length;
  const data: Record<string | symbol, unknown> = {
    ...result,
    scores,
    notCarried,
    ...historyData(notes),
    ...(notes.since === undefined ? {} : { since: notes.since }),
    ...(notes.stats === undefined ? {} : { stats: notes.stats }),
    // burgee N7: an idempotent command says whether it changed anything; only `--stats` writes.
    changed: notes.stats?.counted ?? false,
    ...(sarif === undefined ? {} : { sarif }),
    ...(errors > 0 ? { exitCode: ExitCode.RUNTIME, fix: 'correct each error as its own fix line says, or set its rule to "warn" in `lint.rules`' } : {}),
  };
  data[TEXT] = () => (sarif === undefined ? toText(result, scores, notCarried, notes) : JSON.stringify(sarif, undefined, 2));
  return data;
};

/** The command's work, with the folder and the config as inputs so a test can give its own. */
export const runLint = async (options: LintOptions): Promise<Record<string | symbol, unknown>> => {
  const config = options.config ?? (await loadConfig(options.cwd));
  const root = config?.root ?? options.cwd;
  const configured = config?.input === undefined ? [] : [config.input];
  const specs = options.specs.length > 0 ? options.specs : configured;
  if (specs.length === 0) throw new UsageError('nothing to lint. fix: pass a spec, e.g. `apicontract lint openapi.yaml`, or set `input` in apicontract.config.json');
  const days = idleOption(options);
  const now = options.now ?? new Date();
  const flagged = options.rulesets !== undefined && options.rulesets.length > 0 ? options.rulesets : undefined;
  // The rules the config's plugins contribute (R4); none without a config.
  const contributed = config === undefined ? {} : (await loadPlugins(config)).rules();
  const working = sourcesOf(config?.lint, flagged, (name) => rulesetOfText(name, () => readFileSync(resolve(root, name), 'utf8'), CONFIG_FILE));
  const git = options.git ?? gitIn(root);
  const history = await historyOf({
    git,
    config: config === undefined ? undefined : { file: config.file, name: relative(root, config.file) },
    flagged,
    working,
    resolve: resolverOf(contributed),
    rulesFrom: options.rulesFrom,
    now,
  });
  const { all, levels } = history.resolved;
  const { names, files } = history.sources;
  const notCarried = Object.values(files).flatMap((file) => file.notCarried);
  const legacy = legacyOf(config?.lint?.legacy ?? [], all);
  const { inputs, since } = await inputsOf({ specs, base: options.specs.length > 0 ? options.cwd : root, root, git, since: options.since ?? config?.lint?.since });
  const result = lint(inputs, all, levels, legacy);
  const scores = Object.fromEntries(names.map((name) => [name.replace(PREFIX, ''), scoreOf(rulesetOf(name, files) as Record<string, Level>, result.counts)]));
  const stats = await recordOf({ options, result, git, now }, days);
  return dataOf({ result, scores, notCarried, notes: { ...history, since, stats }, sarif: options.sarif === true ? toSarif(result, all) : undefined });
};

/** The folder the user ran the command in (see command-diff.ts). */
// Stryker disable next-line StringLiteral: equivalent, `resolve('', name)` and `resolve('.', name)` are both the working directory
const HERE = '.';

export const command = defineCommand({
  name: 'lint',
  description: "A contract's form checked by rules: standards, and whether an agent can use it as tools",
  // Only `--stats` writes, and it counts a commit once: running again changes nothing.
  effects: 'idempotent',
  examples: [
    { command: 'apicontract lint openapi.yaml', description: 'the recommended rules, as warnings' },
    { command: 'apicontract lint openapi.yaml --ruleset agent-ready', description: 'can an agent call this API as tools: descriptions, examples, ids' },
  ],
  arguments: [{ name: 'specs', variadic: true, required: false, description: "the contracts to lint (default: the config's input)" }],
  options: {
    ruleset: { type: 'string', multiple: true, choices: Object.keys(rulesets), description: "a ruleset to run, over the config's lint.extends (default recommended)" },
    sarif: { type: 'boolean', description: 'print SARIF 2.1.0 for code scanning instead of text' },
    rulesFrom: { type: 'string', description: 'read the config and its ruleset files at this git ref, so a change to the rules is judged by the old ones; `merge-base` is the base with origin/main' },
    since: { type: 'string', description: "lint in full only the operations added or changed since this git ref; the rest run lint.legacy (default: none). `merge-base` is the base with origin/main; over the config's lint.since" },
    stats: { type: 'string', description: "count this run into a JSON file of per-rule runs, findings and last finding date, once per commit; meant for a CI cache" },
    idle: { type: 'string', description: 'with --stats: list the rules that ran and found nothing in this many days, e.g. 90d, as rule-idle' },
  },
  run: ({ positionals, options }) =>
    runLint({
      cwd: HERE,
      specs: positionals,
      rulesets: options.ruleset as string[] | undefined,
      sarif: options.sarif,
      rulesFrom: options.rulesFrom,
      since: options.since,
      stats: options.stats,
      idle: options.idle,
    }),
});

export { DEFAULT_RULESETS };
