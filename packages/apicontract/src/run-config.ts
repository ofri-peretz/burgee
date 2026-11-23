/**
 * The project's config (apicontract-gen-command R1): `apicontract.config.json`, `.mjs` or `.ts`,
 * the first found wins, in that order. It is data, so an agent can write it unaided: the JSON form
 * validates against {@link configSchema}, and every problem is reported at once, each with a
 * `fix:` line.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { type Options } from './host.js';

export const CONFIG_FILES = ['apicontract.config.json', 'apicontract.config.mjs', 'apicontract.config.ts'] as const;

export interface Target {
  /** The generator's name, as a plugin registers it. */
  readonly generator: string;
  /** The output folder, relative to the project root, with `/` separators. */
  readonly out: string;
  readonly options: Options;
}

export interface ExtractConfig {
  readonly from?: string;
  readonly out?: string;
  readonly options: Options;
}

/** `diff --decisions`: how a change is held to the decision written in the contract. */
export const DECISION_SETTINGS = ['warn', 'error', 'off'] as const;
export type DecisionSetting = (typeof DECISION_SETTINGS)[number];

export interface DiffConfig {
  readonly decisions?: DecisionSetting;
}

export interface Config {
  /** The folder the config file is in: every path in it is relative to this. */
  readonly root: string;
  readonly file: string;
  readonly input?: string;
  readonly overlays: readonly string[];
  readonly plugins: readonly string[];
  readonly targets: Readonly<Record<string, Target>>;
  readonly extract: ExtractConfig;
  /** Absent when the config has no `diff` section. */
  readonly diff?: DiffConfig;
  /** `apicontract lint`'s rulesets and per-rule levels; absent when the config has no `lint` section. */
  readonly lint?: LintConfig;
}

/** `lint`: the rulesets a run starts from, then each rule's level over them (apicontract-lint R8). */
export interface LintConfig {
  readonly extends?: readonly string[];
  readonly rules?: Readonly<Record<string, 'error' | 'warn' | 'off'>>;
}

/** The JSON Schema `apicontract.config.json` validates against. */
export const configSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'apicontract.config.json',
  type: 'object',
  additionalProperties: false,
  properties: {
    $schema: { type: 'string' },
    input: { type: 'string', minLength: 1, description: 'The spec, relative to this file: JSON or YAML' },
    overlays: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'OpenAPI Overlays applied to the input, in order' },
    plugins: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Package names or relative paths; nothing else is loaded' },
    targets: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['generator', 'out'],
        properties: { generator: { type: 'string', minLength: 1 }, out: { type: 'string', minLength: 1 }, options: { type: 'object' } },
      },
    },
    extract: {
      type: 'object',
      additionalProperties: false,
      properties: { from: { type: 'string', minLength: 1 }, out: { type: 'string', minLength: 1 }, options: { type: 'object' } },
    },
    diff: {
      type: 'object',
      additionalProperties: false,
      properties: {
        decisions: { enum: DECISION_SETTINGS, description: 'How `apicontract diff` holds a change to the decision written in the contract. The base ref\'s value wins over the working tree\'s; `--decisions` wins over both' },
      },
    },
    lint: {
      type: 'object',
      additionalProperties: false,
      properties: {
        extends: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Rulesets, in order: `recommended`, `agent-ready`' },
        rules: { type: 'object', additionalProperties: { enum: ['error', 'warn', 'off'] }, description: 'A level per rule id, over the rulesets' },
      },
    },
  },
} as const;

/** The refusal for a config or a spec that cannot be used: exit 3 (R-A2), every problem on its own line with its fix. */
export class ConfigError extends Error {
  readonly code = 'CONFIG';

  constructor(file: string, problems: readonly string[]) {
    super(`${file} cannot be used:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** The refusal for a command line to rewrite: exit 2 (R-A2). The message carries its `fix:`. */
export class UsageError extends Error {
  readonly code = 'USAGE';

  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** A path that stays inside the project: relative, `/` separators, no `..`. `./` and a trailing `/` are allowed. */
export const relativePath = (path: string): string | undefined => {
  const parts = path.split('/').filter((part) => part !== '.');
  if (path.includes('\\') || path.includes(':') || path.startsWith('/') || parts.some((part) => part === '..')) return undefined;
  const kept = parts.filter((part) => part !== '');
  return kept.length === 0 ? '.' : kept.join('/');
};

const strings = (value: unknown, key: string, problems: string[]): string[] => {
  if (value === undefined) return [];
  if (!(Array.isArray(value) && value.every((entry) => text(entry)))) problems.push(`\`${key}\` must be a list of non-empty strings. fix: write \`"${key}": ["…"]\``);
  // A refused value is returned too: validateConfig throws on the problem before anything reads it.
  return value as string[];
};

const options = (value: unknown, where: string, problems: string[]): Options => {
  if (value === undefined) return {};
  if (isRecord(value)) return value;
  problems.push(`\`${where}.options\` must be an object. fix: map each option name to its value`);
  return {};
};

const target = (name: string, value: unknown, problems: string[]): Target | undefined => {
  const where = `targets.${name}`;
  if (!isRecord(value)) {
    problems.push(`\`${where}\` must be an object. fix: write \`{ "generator": "…", "out": "…" }\``);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!['generator', 'out', 'options'].includes(key)) problems.push(`\`${where}.${key}\` is not a target setting. fix: remove it; a target takes generator, out and options`);
  }
  if (!text(value.generator)) problems.push(`\`${where}.generator\` is missing. fix: name the generator, e.g. \`"generator": "${name}"\``);
  const out = text(value.out) ? relativePath(value.out) : undefined;
  if (out === undefined) problems.push(`\`${where}.out\` must be a folder inside the project. fix: write a relative path such as \`"out": "src/generated"\``);
  return { generator: String(value.generator), out: String(out), options: options(value.options, where, problems) };
};

const extractOf = (value: unknown, problems: string[]): ExtractConfig => {
  if (value !== undefined && !isRecord(value)) problems.push('`extract` must be an object. fix: write `{ "from": "…", "out": "spec.json" }`');
  if (!isRecord(value)) return { options: {} };
  for (const key of Object.keys(value)) {
    if (!['from', 'out', 'options'].includes(key)) problems.push(`\`extract.${key}\` is not an extract setting. fix: remove it; extract takes from, out and options`);
  }
  if (value.from !== undefined && !text(value.from)) problems.push('`extract.from` must be an extractor name. fix: write `"from": "…"`');
  if (value.out !== undefined && !(text(value.out) && relativePath(value.out) !== undefined)) problems.push('`extract.out` must be a file inside the project. fix: write `"out": "spec.json"`');
  return {
    ...(value.from === undefined ? {} : { from: value.from as string }),
    ...(value.out === undefined ? {} : { out: value.out as string }),
    options: options(value.options, 'extract', problems),
  };
};

/** `diff.decisions`, checked on its own: a refusal names the three settings. */
const decisionsOf = (value: unknown, problems: string[]): DecisionSetting | undefined => {
  if (value === undefined) return undefined;
  if (DECISION_SETTINGS.includes(value as DecisionSetting)) return value as DecisionSetting;
  problems.push(`\`diff.decisions\` must be one of ${DECISION_SETTINGS.join(', ')}. fix: write \`"decisions": "warn"\``);
  return undefined;
};

const diffOf = (value: unknown, problems: string[]): DiffConfig | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    problems.push('`diff` must be an object. fix: write `{ "decisions": "warn" }`');
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (key !== 'decisions') problems.push(`\`diff.${key}\` is not a diff setting. fix: remove it; diff takes decisions`);
  }
  const decisions = decisionsOf(value.decisions, problems);
  return decisions === undefined ? {} : { decisions };
};

const LINT_LEVELS: readonly unknown[] = ['error', 'warn', 'off'];

const lintOf = (value: unknown, problems: string[]): LintConfig | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    problems.push('`lint` must be an object. fix: write `{ "extends": ["recommended"], "rules": { … } }`');
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!['extends', 'rules'].includes(key)) problems.push(`\`lint.${key}\` is not a lint setting. fix: remove it; lint takes extends and rules`);
  }
  const rules = value.rules;
  if (rules !== undefined && !(isRecord(rules) && Object.values(rules).every((level) => LINT_LEVELS.includes(level)))) {
    problems.push('`lint.rules` must map rule ids to "error", "warn" or "off". fix: write `"rules": { "operation-tags": "error" }`');
  }
  return {
    ...(value.extends === undefined ? {} : { extends: strings(value.extends, 'lint.extends', problems) }),
    ...(rules === undefined ? {} : { rules: rules as LintConfig['rules'] & object }),
  };
};

const targetsOf = (value: unknown, problems: string[]): Record<string, Target> => {
  if (value !== undefined && !isRecord(value)) problems.push('`targets` must be an object. fix: map a target name to `{ "generator": "…", "out": "…" }`');
  if (!isRecord(value)) return {};
  const targets: Record<string, Target> = {};
  for (const [name, entry] of Object.entries(value)) {
    const checked = target(name, entry, problems);
    // The names are the config's own keys, copied onto a fresh object.
    // Stryker disable next-line ConditionalExpression: equivalent, a target that is not an object recorded a problem, so validateConfig throws before `targets` is read
    if (checked !== undefined) targets[name] = checked; // eslint-disable-line secure-coding/detect-object-injection
  }
  return targets;
};

const KEYS = new Set(Object.keys(configSchema.properties));

/** Check a config value read from `file`; every problem is reported, each with its fix. */
export const validateConfig = (value: unknown, file: string): Config => {
  if (!isRecord(value)) throw new ConfigError(file, ['the config is not an object. fix: write `{ "input": "openapi.yaml", "targets": { … } }`']);
  const problems: string[] = [];
  for (const key of Object.keys(value)) {
    if (!KEYS.has(key)) problems.push(`\`${key}\` is not a setting. fix: remove it; the settings are ${[...KEYS].join(', ')}`);
  }
  if (value.input !== undefined && !(text(value.input) && relativePath(value.input) !== undefined)) {
    problems.push('`input` must be a file inside the project. fix: write `"input": "openapi.yaml"`');
  }
  const config = {
    root: dirname(file),
    file,
    ...(value.input === undefined ? {} : { input: value.input as string }),
    overlays: strings(value.overlays, 'overlays', problems),
    plugins: strings(value.plugins, 'plugins', problems),
    targets: targetsOf(value.targets, problems),
    extract: extractOf(value.extract, problems),
  };
  const diff = diffOf(value.diff, problems);
  const lint = lintOf(value.lint, problems);
  if (problems.length > 0) throw new ConfigError(file, problems);
  return { ...config, ...(diff === undefined ? {} : { diff }), ...(lint === undefined ? {} : { lint }) };
};

/** The first config file in `cwd`, in the order {@link CONFIG_FILES} lists them. */
export const findConfig = (cwd: string): string | undefined => CONFIG_FILES.map((name) => resolve(cwd, name)).find((file) => existsSync(file));

const read = async (file: string): Promise<unknown> => {
  if (file.endsWith('.json')) {
    try {
      return JSON.parse(String(readFileSync(file))) as unknown;
    } catch (error) {
      throw new ConfigError(file, [`it is not JSON (${(error as Error).message}). fix: correct the JSON, or validate it against \`configSchema\``]);
    }
  }
  try {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the config is the user's own file, found in their project or named by --config
    const module = (await import(pathToFileURL(file).href)) as { default?: unknown };
    return module.default;
  } catch (error) {
    throw new ConfigError(file, [`it failed to load (${(error as Error).message}). fix: make it a module whose default export is the config object`]);
  }
};

/**
 * The config for a run: the file `--config` names (relative to `cwd`), or the first one found in
 * `cwd`. `undefined` when none is named and none is found; the caller decides whether that is an
 * error.
 */
export const loadConfig = async (cwd: string, explicit?: string): Promise<Config | undefined> => {
  const file = explicit === undefined ? findConfig(cwd) : resolve(cwd, explicit);
  if (file === undefined) return undefined;
  if (!existsSync(file)) throw new ConfigError(file, ['it does not exist. fix: pass `--config` a file that exists, or create `apicontract.config.json`']);
  return validateConfig(await read(file), file);
};

/**
 * `diff.decisions` from the text of an `apicontract.config.json`, and nothing else in it: `diff`
 * reads this from the base ref too (R12), where the rest of the file may be a version this build
 * does not know. `undefined` when the file does not set it.
 */
export const decisionSettingOf = (text: string, file: string): DecisionSetting | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(file, [`it is not JSON (${(error as Error).message}). fix: correct the JSON, or validate it against \`configSchema\``]);
  }
  const section = isRecord(value) && isRecord(value.diff) ? value.diff : {};
  const problems: string[] = [];
  const setting = decisionsOf(section.decisions, problems);
  if (problems.length > 0) throw new ConfigError(file, problems);
  return setting;
};
