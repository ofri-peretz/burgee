/**
 * `lint`'s rules read through git (apicontract-lint spec.md R10, R11): the config and its ruleset
 * files as they were at a ref, what changed in them since, and which rules are new enough to warn
 * first. git runs through bellpull (subprocesses are its job here); a test passes its own `LintGit`.
 */
import { ambientRuntime, run, type Runtime } from 'bellpull';
import { parse as parseYaml } from 'seniority/yaml';

import { type Level, type Rule } from './lint-engine.js';
import { readRedocly } from './lint-redocly.js';
import { rules } from './lint-rules.js';
import { type ReadRuleset, readSpectral } from './lint-spectral.js';
import { ConfigError, type LintConfig, UsageError, validateConfig } from './run-config.js';

/** The four things `lint` asks git. Each answers `undefined` when git has no answer: no repository, no such ref or file. */
export interface LintGit {
  /** The commit a ref names. */
  readonly commit: (ref: string) => Promise<string | undefined>;
  /** The merge base of `HEAD` and `origin/main`, CI's base ref. */
  readonly mergeBase: () => Promise<string | undefined>;
  /** The newest commit on `HEAD` made at or before `date`. */
  readonly before: (date: Date) => Promise<string | undefined>;
  /** A file as it is at a commit, its path relative to the folder git runs in. */
  readonly show: (commit: string, path: string) => Promise<string | undefined>;
}

const git = async (cwd: string, runtime: Runtime, args: readonly string[]): Promise<string | undefined> => {
  // No git on the PATH, or no folder, reads the same as no repository: there is nothing to ask.
  const result = await run('git', args, { cwd, runtime }).catch(() => undefined);
  return result?.ok === true ? result.stdout : undefined;
};

/** The first line of an answer, or `undefined` for none. */
const lineOf = (text: string | undefined): string | undefined => {
  const line = text?.trim();
  return line === '' ? undefined : line;
};

/**
 * git in `cwd`, and only there: the `GIT_*` variables a hook sets (`GIT_DIR`, `GIT_INDEX_FILE`)
 * would point it at the hook's repository instead.
 */
export const gitIn = (cwd: string, ambient: Runtime = ambientRuntime()): LintGit => {
  const runtime = { ...ambient, env: Object.fromEntries(Object.entries(ambient.env).filter(([key]) => !key.startsWith('GIT_'))) };
  return {
    commit: async (ref) => lineOf(await git(cwd, runtime, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])),
    mergeBase: async () => lineOf(await git(cwd, runtime, ['merge-base', 'HEAD', 'origin/main'])),
    before: async (date) => lineOf(await git(cwd, runtime, ['rev-list', '-1', `--before=${date.toISOString()}`, 'HEAD'])),
    show: (commit, path) => git(cwd, runtime, ['show', `${commit}:./${path}`]),
  };
};

/** A ruleset as a run resolves it: every rule it knows, and the level each runs at. */
export interface Resolved {
  readonly all: Readonly<Record<string, Rule>>;
  readonly levels: Readonly<Record<string, Level>>;
}

/** One rule the working tree changed since the ref the rules come from, and not applied (R11). */
export interface RulesetChange {
  readonly id: string;
  /** Its level at the ref; `undefined` when it did not run there. */
  readonly from: Level | undefined;
  /** Its level in the working tree; `undefined` when it would not run. */
  readonly to: Level | undefined;
  /** Its definition changed, whatever its level did. */
  readonly definition: boolean;
}

/** What the working tree changes in the rules, rule by rule, in id order. */
export const changesOf = (base: Resolved, working: Resolved): RulesetChange[] => {
  const levels = { base: new Map(Object.entries(base.levels)), working: new Map(Object.entries(working.levels)) };
  const all = { base: new Map(Object.entries(base.all)), working: new Map(Object.entries(working.all)) };
  const ids = [...new Set([...levels.base.keys(), ...levels.working.keys()])].sort();
  return ids.flatMap((id) => {
    const from = levels.base.get(id);
    const to = levels.working.get(id);
    const definition = all.base.has(id) && all.working.has(id) && JSON.stringify(all.base.get(id)) !== JSON.stringify(all.working.get(id));
    return from === to && !definition ? [] : [{ id, from, to, definition }];
  });
};

/** A `warnFor` duration, `"14d"`, in days. */
export const WARN_FOR = /^(\d+)d$/u;
const DAY = 86_400_000;

/** The moment a rule must have been in the ruleset since to run at its own level: `now` less `warnFor`. */
export const cutoffOf = (warnFor: string, now: Date): Date => new Date(now.getTime() - Number(WARN_FOR.exec(warnFor)?.[1]) * DAY);

/**
 * The rules at `error` that did not run at the cutoff: they warn first (R10). A rule that ran at
 * `warn` then is not new, so moving it to `error` takes effect at once: its findings were already shown.
 */
export const newRulesOf = (levels: Readonly<Record<string, Level>>, then: Readonly<Record<string, Level>>): string[] => {
  const before = new Map(Object.entries(then));
  return Object.entries(levels).flatMap(([id, level]) => (level === 'error' && (before.get(id) ?? 'off') === 'off' ? [id] : []));
};

/** The ruleset a run starts from when neither the flag nor the config names one. */
export const DEFAULT_RULESETS: readonly string[] = ['recommended'];
/** How long a new rule at `error` warns first, when the config does not say (R10). */
export const DEFAULT_WARN_FOR = '14d';
/** A ruleset named by its file: a `.spectral.yaml`, `.spectral.json` or `redocly.yaml` (R9). */
export const RULESET_FILE = /\.(?:json|ya?ml)$/u;
const KNOWN = new Set(Object.keys(rules));
export const SHORT = 7;

/** A ruleset file's text read as rules; text that does not parse is a config to fix. */
export const rulesetOfText = (name: string, read: () => string, configFile: string): ReadRuleset => {
  let document: unknown;
  try {
    // YAML 1.2 reads JSON too.
    document = parseYaml(read());
  } catch (error) {
    throw new ConfigError(configFile, [`\`lint.extends\` names ${name}, which cannot be read (${(error as Error).message}). fix: correct its path; it is read from the config's folder`]);
  }
  // The file's name says whose ruleset it is: Redocly's `redocly.yaml`, else Spectral's.
  return (/redocly/iu.test(name.split('/').at(-1) as string) ? readRedocly : readSpectral)(document, name, KNOWN);
};

/** What a run's rules are read from (R8): the rulesets named, the config's levels over them, and the files among them. */
export interface Sources {
  readonly names: readonly string[];
  readonly overrides: Readonly<Record<string, Level>> | undefined;
  readonly files: Readonly<Record<string, ReadRuleset>>;
  readonly warnFor: string;
}

/** The sources a config gives, its ruleset files read by `read`; `flagged` rulesets win over its `extends`. */
export const sourcesOf = (lint: LintConfig | undefined, flagged: readonly string[] | undefined, read: (name: string) => ReadRuleset): Sources => {
  const names = flagged ?? lint?.extends ?? DEFAULT_RULESETS;
  return { names, overrides: lint?.rules, files: Object.fromEntries(names.filter((name) => RULESET_FILE.test(name)).map((name) => [name, read(name)])), warnFor: lint?.warnFor ?? DEFAULT_WARN_FOR };
};

/** The sources as they were at a commit: the config's JSON there, and each ruleset file it names. */
const sourcesAt = async (git: LintGit, commit: string, config: { readonly file: string; readonly name: string }, flagged: readonly string[] | undefined): Promise<Sources> => {
  const where = `${config.name} at ${commit.slice(0, SHORT)}`;
  const text = await git.show(commit, config.name);
  let lint: LintConfig | undefined;
  if (text !== undefined) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new ConfigError(where, [`it is not JSON (${(error as Error).message}). fix: correct it in a commit, or pass a later ref`]);
    }
    lint = validateConfig(value, where).lint;
  }
  const names = (flagged ?? lint?.extends ?? DEFAULT_RULESETS).filter((name) => RULESET_FILE.test(name));
  const texts = new Map(await Promise.all(names.map(async (name) => [name, await git.show(commit, name)] as const)));
  return sourcesOf(lint, flagged, (name) =>
    rulesetOfText(name, () => texts.get(name) ?? uncommitted(name, commit), where),
  );
};

const uncommitted = (name: string, commit: string): never => {
  throw new Error(`it is not in commit ${commit.slice(0, SHORT)}`);
};

/** One run's rules through git: where they came from, what the working tree changed, and what warns first. */
export interface History {
  readonly sources: Sources;
  readonly resolved: Resolved;
  /** `--rules-from`'s answer, for the coverage line; absent when it was not given. */
  readonly from?: string;
  readonly changed: readonly RulesetChange[];
  /** The rules that warn first; empty when none do or it was not checked. */
  readonly warnFirst: readonly string[];
  /** Why warn-first was not checked, when it was not. */
  readonly unchecked?: string;
}

export interface HistoryRun {
  readonly git: LintGit;
  /** The config file, absolute and relative to the folder git runs in; absent without a config. */
  readonly config: { readonly file: string; readonly name: string } | undefined;
  readonly flagged: readonly string[] | undefined;
  readonly working: Sources;
  readonly resolve: (sources: Sources) => Resolved;
  readonly rulesFrom: string | undefined;
  readonly now: Date;
}

/**
 * The commit a ref on `flag` names: `merge-base` is CI's base. `undefined` outside a repository,
 * where there is nothing to ask; a ref git cannot find inside one is a command line to fix.
 */
export const commitOf = async (git: LintGit, flag: string, ref: string): Promise<string | undefined> => {
  const commit = ref === 'merge-base' ? await git.mergeBase() : await git.commit(ref);
  return commit ?? missing(flag, ref, await git.commit('HEAD'));
};

const missing = (flag: string, ref: string, head: string | undefined): undefined => {
  if (head === undefined) return undefined;
  throw new UsageError(`\`${flag} ${ref}\` names no commit here. fix: fetch it first (in CI, \`git fetch origin main\`), or pass a ref this checkout has`);
};

/** The sources a run applies (R11): the working tree's, or the base ref's with what changed since. */
const appliedOf = async (run: HistoryRun): Promise<Pick<History, 'from' | 'changed' | 'sources'>> => {
  const ref = run.rulesFrom;
  if (ref === undefined) return { sources: run.working, changed: [] };
  if (run.config === undefined) return { sources: run.working, from: 'the working tree: there is no config to read at a ref', changed: [] };
  if (!run.config.name.endsWith('.json')) throw new UsageError(`\`--rules-from\` reads contractdiff.config.json at the ref, and the config is ${run.config.name}. fix: move the config to contractdiff.config.json, or drop --rules-from`);
  const commit = await commitOf(run.git, '--rules-from', ref);
  if (commit === undefined) return { sources: run.working, from: 'the working tree: not a git repository', changed: [] };
  const sources = await sourcesAt(run.git, commit, run.config, run.flagged);
  return { sources, from: `${ref} (${commit.slice(0, SHORT)})`, changed: changesOf(run.resolve(sources), run.resolve(run.working)) };
};

/** The levels a run had at the cutoff, or why they cannot be known. */
const thenOf = async (run: HistoryRun, warnFor: string): Promise<Readonly<Record<string, Level>> | string> => {
  const config = run.config as { readonly file: string; readonly name: string };
  if (!config.name.endsWith('.json')) return 'the config is not JSON, so its history is not read';
  if ((await run.git.commit('HEAD')) === undefined) return 'not a git repository';
  const commit = await run.git.before(cutoffOf(warnFor, run.now));
  // No commit that old: every rule is newer than the cutoff.
  if (commit === undefined) return {};
  try {
    return run.resolve(await sourcesAt(run.git, commit, config, run.flagged)).levels;
  } catch (error) {
    return `the rules at ${commit.slice(0, SHORT)} cannot be read (${(error as Error).message.split('\n')[0] as string})`;
  }
};

/** A run's rules through git (R10, R11). */
export const historyOf = async (run: HistoryRun): Promise<History> => {
  const applied = await appliedOf(run);
  const resolved = run.resolve(applied.sources);
  const atError = Object.values(resolved.levels).includes('error');
  // Without a config the rules are built in, and no built-in ruleset sets `error`.
  // Stryker disable next-line ConditionalExpression: equivalent, a run with no config has no rule at error, so `atError` already stops it
  if (!atError || run.config === undefined || cutoffOf(applied.sources.warnFor, run.now).getTime() === run.now.getTime()) return { ...applied, resolved, warnFirst: [] };
  const then = await thenOf(run, applied.sources.warnFor);
  if (typeof then === 'string') return { ...applied, resolved, warnFirst: [], unchecked: then };
  const warnFirst = newRulesOf(resolved.levels, then);
  const levels = { ...resolved.levels, ...Object.fromEntries(warnFirst.map((id): [string, Level] => [id, 'warn'])) };
  return { ...applied, resolved: { all: resolved.all, levels }, warnFirst };
};
