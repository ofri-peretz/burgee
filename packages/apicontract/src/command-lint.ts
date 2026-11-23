/**
 * `apicontract lint [spec…]` (apicontract-lint spec.md R1–R3, R8): a contract's form checked by
 * rules that are data, on every format the adapters read. Text grouped by file, `--json`, or
 * `--sarif`; every finding with its `fix:` line; exit 1 when any finding is at `error`. Every run
 * ends with what it checked, and each ruleset's score: the share of its checks that passed.
 */
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { defineCommand, ExitCode } from 'burgee';
import { parse as parseYaml } from 'seniority/yaml';

import { uriOf } from './command-diff.js';
import { builtinAdapters } from './inputs.js';
import { type Level, lint, type Rule, type LintFinding, type LintInput, type LintResult } from './lint-engine.js';
import { DEFAULT_RULESETS, gitIn, historyOf, type History, type LintGit, type Resolved, RULESET_FILE, rulesetOfText, type RulesetChange, type Sources, sourcesOf } from './lint-history.js';
import { rules, rulesets } from './lint-rules.js';
import { type NotCarried, type ReadRuleset } from './lint-spectral.js';
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

/** One input read through the first adapter that detects it. */
export const readInput = (file: string, cwd: string): LintInput => {
  let document: unknown;
  try {
    // YAML 1.2 reads JSON too.
    document = parseYaml(readFileSync(resolve(cwd, file), 'utf8'));
  } catch (error) {
    throw new UsageError(`cannot read ${file}: ${(error as Error).message}. fix: pass a JSON or YAML document that exists`);
  }
  const found = Object.entries(builtinAdapters).find(([, adapter]) => adapter.detect(document));
  if (found === undefined) throw new UsageError(`no input format reads ${file}. fix: pass a document one of these reads: ${Object.keys(builtinAdapters).join(', ')}`);
  return { file, contract: found[1].read(document) };
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

/** Where the rules came from and what warns first, for the coverage line. */
const historyNote = (history: Partial<History>): string =>
  [
    ...(history.from === undefined ? [] : [`; rules from ${history.from}`]),
    ...(history.warnFirst === undefined || history.warnFirst.length === 0 ? [] : [`; warn first: ${String(history.warnFirst.length)} (${history.warnFirst.join(', ')})`]),
    ...(history.unchecked === undefined ? [] : [`; warn first not checked: ${history.unchecked}`]),
  ].join('');

/** Text grouped by file, then what was checked and each ruleset's score. */
export const toText = (result: LintResult, scores: Readonly<Record<string, Score>>, notCarried: readonly NotCarried[] = [], history: Partial<History> = {}): string => {
  const lines: string[] = changedLines(history);
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

/** The command's work, with the folder and the config as inputs so a test can give its own. */
export const runLint = async (options: LintOptions): Promise<Record<string | symbol, unknown>> => {
  const config = options.config ?? (await loadConfig(options.cwd));
  const root = config?.root ?? options.cwd;
  const configured = config?.input === undefined ? [] : [config.input];
  const specs = options.specs.length > 0 ? options.specs : configured;
  if (specs.length === 0) throw new UsageError('nothing to lint. fix: pass a spec, e.g. `apicontract lint openapi.yaml`, or set `input` in apicontract.config.json');
  const flagged = options.rulesets !== undefined && options.rulesets.length > 0 ? options.rulesets : undefined;
  // The rules the config's plugins contribute (R4); none without a config.
  const contributed = config === undefined ? {} : (await loadPlugins(config)).rules();
  const working = sourcesOf(config?.lint, flagged, (name) => rulesetOfText(name, () => readFileSync(resolve(root, name), 'utf8'), CONFIG_FILE));
  const history = await historyOf({
    git: options.git ?? gitIn(root),
    config: config === undefined ? undefined : { file: config.file, name: relative(root, config.file) },
    flagged,
    working,
    resolve: resolverOf(contributed),
    rulesFrom: options.rulesFrom,
    now: options.now ?? new Date(),
  });
  const { all, levels } = history.resolved;
  const { names, files } = history.sources;
  const notCarried = Object.values(files).flatMap((file) => file.notCarried);
  const result = lint(
    specs.map((spec) => readInput(spec, options.specs.length > 0 ? options.cwd : root)),
    all,
    levels,
  );
  const scores = Object.fromEntries(names.map((name) => [name.replace(PREFIX, ''), scoreOf(rulesetOf(name, files) as Record<string, Level>, result.counts)]));
  const errors = result.findings.filter((finding) => finding.level === 'error').length;
  const sarif = options.sarif === true ? toSarif(result, all) : undefined;
  const data: Record<string | symbol, unknown> = {
    ...result,
    scores,
    notCarried,
    ...historyData(history),
    ...(sarif === undefined ? {} : { sarif }),
    ...(errors > 0 ? { exitCode: ExitCode.RUNTIME, fix: 'correct each error as its own fix line says, or set its rule to "warn" in `lint.rules`' } : {}),
  };
  data[TEXT] = () => (sarif === undefined ? toText(result, scores, notCarried, history) : JSON.stringify(sarif, undefined, 2));
  return data;
};

/** The folder the user ran the command in (see command-diff.ts). */
// Stryker disable next-line StringLiteral: equivalent, `resolve('', name)` and `resolve('.', name)` are both the working directory
const HERE = '.';

export const command = defineCommand({
  name: 'lint',
  description: "A contract's form checked by rules: standards, and whether an agent can use it as tools",
  effects: 'read_only',
  examples: [
    { command: 'apicontract lint openapi.yaml', description: 'the recommended rules, as warnings' },
    { command: 'apicontract lint openapi.yaml --ruleset agent-ready', description: 'can an agent call this API as tools: descriptions, examples, ids' },
  ],
  arguments: [{ name: 'specs', variadic: true, required: false, description: "the contracts to lint (default: the config's input)" }],
  options: {
    ruleset: { type: 'string', multiple: true, choices: Object.keys(rulesets), description: "a ruleset to run, over the config's lint.extends (default recommended)" },
    sarif: { type: 'boolean', description: 'print SARIF 2.1.0 for code scanning instead of text' },
    rulesFrom: { type: 'string', description: 'read the config and its ruleset files at this git ref, so a change to the rules is judged by the old ones; `merge-base` is the base with origin/main' },
  },
  run: ({ positionals, options }) =>
    runLint({ cwd: HERE, specs: positionals, rulesets: options.ruleset as string[] | undefined, sarif: options.sarif, rulesFrom: options.rulesFrom }),
});

export { DEFAULT_RULESETS };
