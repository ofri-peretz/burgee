/**
 * `apicontract lint [spec…]` (apicontract-lint spec.md R1–R3, R8): a contract's form checked by
 * rules that are data, on every format the adapters read. Text grouped by file, `--json`, or
 * `--sarif`; every finding with its `fix:` line; exit 1 when any finding is at `error`. Every run
 * ends with what it checked, and each ruleset's score: the share of its checks that passed.
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { defineCommand, ExitCode } from 'burgee';
import { parse as parseYaml } from 'seniority/yaml';

import { uriOf } from './command-diff.js';
import { builtinAdapters } from './inputs.js';
import { type Level, lint, type Rule, type LintFinding, type LintInput, type LintResult } from './lint-engine.js';
import { readRedocly } from './lint-redocly.js';
import { rules, rulesets } from './lint-rules.js';
import { type NotCarried, type ReadRuleset, readSpectral } from './lint-spectral.js';
import { type Config, ConfigError, loadConfig, UsageError } from './run-config.js';
import { loadPlugins } from './run-load.js';

const TEXT = Symbol.for('burgee.text');

/** The ruleset a run starts from when neither the flag nor the config names one. */
export const DEFAULT_RULESETS: readonly string[] = ['recommended'];
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
}

export interface Score {
  readonly passed: number;
  readonly checked: number;
  /** Rounded down, so 99.9% never reads as 100%. */
  readonly percent: number;
}

/** A ruleset named by its file: a `.spectral.yaml`, `.spectral.json` or `redocly.yaml` (R9). */
const RULESET_FILE = /\.(?:json|ya?ml)$/u;

/** A ruleset file read from the config's folder; one that cannot be read is a config to fix. */
const readRulesetFile = (name: string, root: string): ReadRuleset => {
  let document: unknown;
  try {
    // YAML 1.2 reads JSON too.
    document = parseYaml(readFileSync(resolve(root, name), 'utf8'));
  } catch (error) {
    throw new ConfigError(CONFIG_FILE, [`\`lint.extends\` names ${name}, which cannot be read (${(error as Error).message}). fix: correct its path; it is read from the config's folder`]);
  }
  // The file's name says whose ruleset it is: Redocly's `redocly.yaml`, else Spectral's.
  return (/redocly/iu.test(basename(name)) ? readRedocly : readSpectral)(document, name, new Set(RULES.keys()));
};

/** Every ruleset file `names` lists, read from `root`, by its name. */
export const readRulesets = (names: readonly string[], root: string): Record<string, ReadRuleset> =>
  Object.fromEntries(names.filter((name) => RULESET_FILE.test(name)).map((name) => [name, readRulesetFile(name, root)]));

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

/** Text grouped by file, then what was checked and each ruleset's score. */
export const toText = (result: LintResult, scores: Readonly<Record<string, Score>>, notCarried: readonly NotCarried[] = []): string => {
  const lines: string[] = [];
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
    `${String(errors)} error(s), ${String(result.findings.length - errors)} warning(s). Checked ${String(Object.keys(result.counts).length)} rule(s) on ${String(result.inputs.length)} input(s), ${String(nodes)} node(s); not carried: ${notCarried.length === 0 ? 'none' : `${String(notCarried.length)} (${notCarried.map((entry) => entry.id).join(', ')})`}.`,
    ...Object.entries(scores).map(([name, score]) => `${name}: ${String(score.percent)}% (${String(score.passed)} of ${String(score.checked)} checks passed)`),
  );
  return lines.join('\n');
};

/** The command's work, with the folder and the config as inputs so a test can give its own. */
export const runLint = async (options: LintOptions): Promise<Record<string | symbol, unknown>> => {
  const config = options.config ?? (await loadConfig(options.cwd));
  const root = config?.root ?? options.cwd;
  const configured = config?.input === undefined ? [] : [config.input];
  const specs = options.specs.length > 0 ? options.specs : configured;
  if (specs.length === 0) throw new UsageError('nothing to lint. fix: pass a spec, e.g. `apicontract lint openapi.yaml`, or set `input` in apicontract.config.json');
  const names = options.rulesets !== undefined && options.rulesets.length > 0 ? options.rulesets : (config?.lint?.extends ?? DEFAULT_RULESETS);
  // The rules the config's plugins contribute (R4); none without a config.
  const contributed = config === undefined ? {} : (await loadPlugins(config)).rules();
  const files = readRulesets(names, root);
  const all = { ...rules, ...Object.assign({}, ...Object.values(files).map((file) => file.rules)), ...contributed } as Record<string, Rule>;
  const levels = levelsOf(names, config?.lint?.rules, contributed, files);
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
    ...(sarif === undefined ? {} : { sarif }),
    ...(errors > 0 ? { exitCode: ExitCode.RUNTIME, fix: 'correct each error as its own fix line says, or set its rule to "warn" in `lint.rules`' } : {}),
  };
  data[TEXT] = () => (sarif === undefined ? toText(result, scores, notCarried) : JSON.stringify(sarif, undefined, 2));
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
  },
  run: ({ positionals, options }) => runLint({ cwd: HERE, specs: positionals, rulesets: options.ruleset as string[] | undefined, sarif: options.sarif }),
});
