/**
 * replz's commands, declared once so burgee projects each to `--json`, `--schema` and completions.
 * `run` calls a model once per case and once per graded finding, so it is never a per-PR step: it
 * runs by hand or on a schedule (replz intent, constraints). `check` and `propose` cost nothing.
 */
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { defineCommand, defineProgram } from 'burgee';
import { parse as parseYaml } from 'seniority/yaml';

import { type Case, parseCase, selectCases, SETS } from './cases.js';
import { CONFIG, type Config, parseConfig } from './config.js';
import { LOG_ARGS, parseLog, propose, toYaml } from './propose.js';
import { replayCase, type Shell, type Worktrees } from './run.js';
import { type CaseResult, score, toText } from './score.js';
import { logOf, sh, worktreesIn } from './shell.js';

export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** Ten bug cases and ten controls: the intent's first success criterion. */
export const DEFAULT_LIMIT = 10;

const TEXT = Symbol.for('burgee.text');

type Data = Record<string | symbol, unknown>;

// Stryker disable next-line StringLiteral: equivalent, `resolve('', x)` and `resolve('.', x)` are both the working directory
const HERE = '.';
export const CASES = '.sdlc/replz/cases';
export const HISTORY = '.sdlc/replz/history.jsonl';

/** Every `*.yaml` case under `dir`, sorted by file name. */
export const readCases = (repo: string, dir: string): Case[] =>
  readdirSync(resolve(repo, dir))
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => parseCase(`${dir}/${name}`, readFileSync(join(resolve(repo, dir), name), 'utf8')));

const readConfig = (repo: string, path: string): Config => parseConfig(path, readFileSync(resolve(repo, path), 'utf8'));

/** The ids of the checklist's items, so one that never fires is named. */
const itemsOf = (repo: string, config: Config): string[] => {
  if (config.checklist === undefined) return [];
  const document = parseYaml(readFileSync(resolve(repo, config.checklist), 'utf8')) as { items?: { id: string }[] };
  return (document.items ?? []).map((item) => item.id);
};

export interface CheckOptions {
  readonly repo: string;
  readonly config: string;
  readonly cases: string;
}

/** The config and every case parse, the sets hold both kinds, and ids are distinct: what a run needs. */
export const runCheck = (options: CheckOptions): Data => {
  const config = readConfig(options.repo, options.config);
  const cases = selectCases(readCases(options.repo, options.cases), undefined);
  const count = (set: Case['set'], kind: Case['kind']): number => cases.filter((found) => found.set === set && found.kind === kind).length;
  const sets = Object.fromEntries(SETS.map((set) => [set, { bugs: count(set, 'bug'), controls: count(set, 'control') }]));
  const data: Data = { cases: cases.length, sets, checks: config.checks.length, stages: config.stages };
  data[TEXT] = () => `${String(cases.length)} case(s): ${SETS.map((set) => `${set} ${String(count(set, 'bug'))} bug(s) + ${String(count(set, 'control'))} control(s)`).join(', ')}; ${String(config.checks.length)} check(s); stages ${config.stages.join(' > ')}`;
  return data;
};

export interface RunOptions extends CheckOptions {
  readonly set?: Case['set'] | undefined;
  readonly model?: string | undefined;
  readonly maxFindings?: number | undefined;
  /** Append the report to the history file. */
  readonly record: boolean;
  readonly shell: Shell;
  readonly worktrees: Worktrees;
  readonly now: () => Date;
}

export const runReplay = async (options: RunOptions): Promise<Data> => {
  const base = readConfig(options.repo, options.config);
  const config: Config = { ...base, maxFindings: options.maxFindings ?? base.maxFindings };
  const model = options.model ?? config.model;
  const cases = selectCases(readCases(options.repo, options.cases), options.set);
  const results: CaseResult[] = [];
  for (const found of cases) {
    // eslint-disable-next-line reliability/no-await-in-loop -- one case at a time: each holds a worktree with its own install, and each reviewer call is paid
    results.push(await replayCase({ shell: options.shell, worktrees: options.worktrees, config, model }, found));
  }
  const report = score(
    results,
    config.stages,
    config.checks.map((check) => check.id),
    itemsOf(options.repo, config),
  );
  const entry = { date: options.now().toISOString().slice(0, 'yyyy-mm-dd'.length), set: options.set ?? 'all', model, maxFindings: config.maxFindings, cases: cases.map((found) => found.id), report };
  if (options.record) appendFileSync(resolve(options.repo, HISTORY), `${JSON.stringify(entry)}\n`);
  const data: Data = { ...entry, recorded: options.record };
  data[TEXT] = () => `${toText(report)}${options.record ? `\n\nrecorded in ${HISTORY}` : ''}`;
  return data;
};

export interface ProposeOptions {
  readonly repo: string;
  readonly ref: string;
  readonly limit: number;
  readonly log: (repo: string, args: readonly string[]) => Promise<string>;
}

export const runPropose = async (options: ProposeOptions): Promise<Data> => {
  const commits = parseLog(await options.log(options.repo, [...LOG_ARGS, options.ref]));
  const { bugs, controls } = propose(commits, options.limit);
  const subjectOf = (found: Case): string => (commits.find((commit) => commit.sha.startsWith(found.head)) as { subject: string }).subject;
  const drafts = [...bugs, ...controls].map((found) => ({ file: `${CASES}/${found.id}.yaml`, text: toYaml(found, subjectOf(found)) }));
  const data: Data = { bugs: bugs.length, controls: controls.length, drafts };
  data[TEXT] = () =>
    drafts.length === 0
      ? `no revert or fix on ${options.ref} names a pull request. fix: write cases by hand from the incident ledger`
      : drafts.map((draft) => `--- ${draft.file}\n${draft.text}`).join('\n');
  return data;
};

const repoOption = { type: 'string', default: HERE, description: 'the repository (default: the current directory)', placeholder: 'dir' } as const;
const configOption = { type: 'string', default: CONFIG, description: 'the replz config', placeholder: 'path' } as const;
const casesOption = { type: 'string', default: CASES, description: 'the folder of case files', placeholder: 'dir' } as const;

export const program = defineProgram({
  name: 'replz',
  version: VERSION,
  description: 'Grade the reviewer and the checks against bugs that actually happened',
  commands: [
    defineCommand({
      name: 'check',
      description: 'Validate the replz config and every case, and count each set',
      effects: 'read_only',
      examples: [{ command: 'replz check', description: 'are the cases ready to run' }],
      options: { repo: repoOption, config: configOption, cases: casesOption },
      run: ({ options }) => runCheck({ repo: options.repo as string, config: options.config as string, cases: options.cases as string }),
    }),
    defineCommand({
      name: 'run',
      description: 'Replay every case through the reviewer and the checks, grade the findings, and report recall per stage',
      effects: 'non_idempotent',
      examples: [
        { command: 'replz run --set test', description: 'the score on the held-out cases' },
        { command: 'replz run --set tune --max-findings 5 --record', description: 'a cheaper run, appended to the history' },
      ],
      options: {
        repo: repoOption,
        config: configOption,
        cases: casesOption,
        set: { type: 'string', choices: SETS, description: 'only the cases of this set (default: both)' },
        model: { type: 'string', description: 'the grader model, put into the grader command (default: the config)', placeholder: 'id' },
        maxFindings: { type: 'number', description: 'the most findings graded per case, which caps the cost (default: the config)', placeholder: 'n' },
        record: { type: 'boolean', description: `append the report to ${HISTORY}` },
      },
      run: ({ options }) =>
        runReplay({
          repo: options.repo as string,
          config: options.config as string,
          cases: options.cases as string,
          set: options.set as Case['set'] | undefined,
          model: options.model as string | undefined,
          maxFindings: options.maxFindings as number | undefined,
          record: options.record === true,
          shell: sh,
          worktrees: worktreesIn(options.repo as string),
          now: () => new Date(),
        }),
    }),
    defineCommand({
      name: 'propose',
      description: 'Draft bug cases from reverts and fixes on main, each with a size-matched control, for a person to finish',
      effects: 'read_only',
      examples: [{ command: 'replz propose --limit 10', description: 'ten bug drafts and ten controls' }],
      options: {
        repo: repoOption,
        ref: { type: 'string', default: 'origin/main', description: 'the history to read', placeholder: 'ref' },
        limit: { type: 'number', default: DEFAULT_LIMIT, description: 'the most bug cases to draft', placeholder: 'n' },
      },
      run: ({ options }) => runPropose({ repo: options.repo as string, ref: options.ref as string, limit: options.limit as number, log: logOf }),
    }),
  ],
});
