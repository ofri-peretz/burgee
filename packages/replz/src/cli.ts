/**
 * replz's commands, declared once so burgee projects each to `--json`, `--schema` and completions.
 * `run` calls a model once per case and once per graded finding, so it is never a per-PR step: it
 * runs by hand or on a schedule (replz intent, constraints). `check` and `propose` cost nothing.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { defineCommand, defineProgram } from 'burgee';
import { parse as parseYaml } from 'seniority/yaml';

import { type Case, KINDS, parseCase, selectCases, SETS } from './cases.js';
import { COMPARE, type CompareConfig, compareText, judge, type Output, parseCompareConfig } from './compare.js';
import { CONFIG, type Config, parseConfig } from './config.js';
import { candidatesMarkdown, findingsOf, ghQueries, mine, parseComments } from './mine.js';
import { LOG_ARGS, parseLog, propose, toYaml } from './propose.js';
import { refusing } from './refusal.js';
import { replayCase, type Shell, type Worktrees } from './run.js';
import { type CaseResult, score, toText } from './score.js';
import { breaches, type Git, type HistoryEntry, isFix, isRevert, MAIN_LOG_ARGS, parseMainLog, type Ratchet, scorecard, scorecardText, traceFix, TRIAGE } from './scorecard.js';
import { ghOf, logOf, sh, worktreesIn } from './shell.js';

export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** Ten bug cases and ten controls: the intent's first success criterion. */
export const DEFAULT_LIMIT = 10;

const TEXT = Symbol.for('burgee.text');

type Data = Record<string | symbol, unknown>;

// Stryker disable next-line StringLiteral: equivalent, `resolve('', x)` and `resolve('.', x)` are both the working directory
const HERE = '.';
export const CASES = '.sdlc/replz/cases';
export const HISTORY = '.sdlc/replz/history.jsonl';

/** `path` under `repo`, refused with the option that moves it when it is not there. */
const existing = (repo: string, path: string, option: string): string => {
  const at = resolve(repo, path);
  if (!existsSync(at)) throw new Error(`${path} does not exist in ${resolve(repo)}. fix: run replz in the repository it replays, or pass --repo, or ${option}`);
  return at;
};

/** Every `*.yaml` case under `dir`, sorted by file name, each named `<id>.yaml`. */
export const readCases = (repo: string, dir: string): Case[] => {
  const at = existing(repo, dir, '--cases');
  return readdirSync(at)
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => {
      const found = parseCase(`${dir}/${name}`, readFileSync(join(at, name), 'utf8'));
      if (name !== `${found.id}.yaml`) throw new Error(`${dir}/${name} holds the case \`${found.id}\`. fix: rename the file ${found.id}.yaml, or change its id`);
      return found;
    });
};

const readConfig = (repo: string, path: string): Config => parseConfig(path, readFileSync(existing(repo, path, '--config'), 'utf8'));

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

/**
 * The config and every case parse, each case file is named by its id, no answer is the draft's
 * placeholder, ids are distinct, and each set holds a bug and a control: what a run needs. A set of
 * one kind gives a score of one kind, recall with no false alarms or the reverse.
 */
export const runCheck = (options: CheckOptions): Data => {
  const config = readConfig(options.repo, options.config);
  const cases = selectCases(readCases(options.repo, options.cases), undefined);
  const count = (set: Case['set'], kind: Case['kind']): number => cases.filter((found) => found.set === set && found.kind === kind).length;
  const short = SETS.flatMap((set) => KINDS.filter((kind) => count(set, kind) === 0).map((kind) => `the ${set} set has no ${kind} case`));
  if (short.length > 0) throw new Error(`${short.join('; ')}. fix: add the cases each set lacks (replz propose drafts them), so neither score is of one kind`);
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
    results.push(await replayCase({ shell: options.shell, worktrees: options.worktrees, config, model, repo: resolve(options.repo) }, found));
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

/** Thirty days: long enough for a fix to land after the change it repairs, short enough to move. */
export const DEFAULT_DAYS = 30;

export interface ScorecardOptions {
  readonly repo: string;
  readonly ref: string;
  readonly days: number;
  readonly cases: string;
  readonly ratchet?: string | undefined;
  readonly git: Git;
  readonly now: () => Date;
}

const DAY = 86_400_000;

/** The pull requests the case folder already holds, read from file names so a draft counts too. */
const casedPrs = (repo: string, dir: string): Set<number> => {
  const at = resolve(repo, dir);
  if (!existsSync(at)) return new Set();
  return new Set(readdirSync(at).flatMap((name) => /^bug-(\d+)\.yaml$/u.exec(name)?.slice(1) ?? []).map(Number));
};

/** The escapes dismissed in the triage file, `{ "dismissed": { "<pr>": "<why it is not one>" } }`. */
export const readDismissed = (repo: string): Map<number, string> => {
  const at = resolve(repo, TRIAGE);
  if (!existsSync(at)) return new Map();
  const { dismissed = {} } = JSON.parse(readFileSync(at, 'utf8')) as { dismissed?: Record<string, string> };
  const bad = Object.entries(dismissed).filter(([pr, why]) => !/^\d+$/u.test(pr) || typeof why !== 'string' || why.trim() === '');
  if (bad.length > 0) throw new Error(`${TRIAGE} dismisses ${bad.map(([pr]) => pr).join(', ')} without a pull request number and a reason. fix: key each by its number, and say why it is not an escape`);
  return new Map(Object.entries(dismissed).map(([pr, why]) => [Number(pr), why]));
};

const lastRun = (repo: string): HistoryEntry | undefined => {
  const at = resolve(repo, HISTORY);
  if (!existsSync(at)) return undefined;
  const last = readFileSync(at, 'utf8').trim().split('\n').at(-1);
  return last === undefined || last === '' ? undefined : (JSON.parse(last) as HistoryEntry);
};

export const runScorecard = async (options: ScorecardOptions): Promise<Data> => {
  const commits = parseMainLog(await options.git([...MAIN_LOG_ARGS, options.ref]));
  const since = new Date(options.now().getTime() - options.days * DAY).toISOString().slice(0, 'yyyy-mm-dd'.length);
  const traced = new Map<string, readonly string[]>();
  for (const commit of commits.filter((found) => found.date >= since && (isFix(found.subject) || isRevert(found.subject)))) {
    // eslint-disable-next-line reliability/no-await-in-loop -- one fix at a time: each runs a diff and blames, and parallel blames thrash the pack cache
    traced.set(commit.sha, await traceFix(options.git, commit.sha));
  }
  const card = scorecard({ commits, since, traced, cased: casedPrs(options.repo, options.cases), dismissed: readDismissed(options.repo), history: lastRun(options.repo) });
  if (options.ratchet !== undefined) {
    const ratchet = JSON.parse(readFileSync(existing(options.repo, options.ratchet, '--ratchet'), 'utf8')) as Ratchet;
    const broken = breaches(card, ratchet);
    if (broken.length > 0) throw new Error(`the scorecard left its bands: ${broken.join('; ')}`);
  }
  const data: Data = { ...card };
  data[TEXT] = () => scorecardText(card);
  return data;
};

/** Where `mine --write` puts the draft, beside the cases a person finishes. */
export const CANDIDATES = '.sdlc/replz/rule-candidates.md';

/** Ten candidates: enough to pick from, few enough to read. */
export const DEFAULT_CANDIDATES = 10;

export interface MineCommandOptions {
  readonly repo: string;
  /** `owner/name`; the repository `gh` resolves in `repo` when absent. */
  readonly slug?: string | undefined;
  readonly days: number;
  readonly minPrs: number;
  readonly limit: number;
  /** Write the draft to this path under the repository. */
  readonly write?: string | undefined;
  readonly gh: (args: readonly string[]) => Promise<string>;
  readonly now: () => Date;
}

/** Writes `text` at `at` unless it is there already; true when the file changed. */
const writeIfChanged = (at: string, text: string): boolean => {
  if (existsSync(at) && readFileSync(at, 'utf8') === text) return false;
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, text);
  return true;
};

export const runMine = async (options: MineCommandOptions): Promise<Data> => {
  const slug = options.slug ?? (await options.gh(['api', 'repos/{owner}/{repo}', '--jq', '.full_name'])).trim();
  const since = new Date(options.now().getTime() - options.days * DAY).toISOString().slice(0, 'yyyy-mm-dd'.length);
  const comments = [];
  for (const query of ghQueries(slug, since)) {
    // eslint-disable-next-line reliability/no-await-in-loop -- two pages of the same API, one after the other, so a rate limit stops the first
    comments.push(...parseComments(await options.gh(query)));
  }
  const findings = comments.flatMap(findingsOf);
  const candidates = mine(findings, { minPrs: options.minPrs, limit: options.limit });
  const draft = candidatesMarkdown(candidates, { slug, since, findings: findings.length });
  const changed = options.write !== undefined && writeIfChanged(resolve(options.repo, options.write), draft);
  const data: Data = { slug, since, findings: findings.length, candidates, written: options.write ?? null, changed };
  const verb = changed ? 'written to' : 'unchanged in';
  const where = options.write === undefined ? '' : `\n${verb} ${options.write}`;
  data[TEXT] = () =>
    candidates.length === 0
      ? `no pattern in ${String(findings.length)} review finding(s) since ${since} recurs in ${String(options.minPrs)} or more pull requests. fix: widen --days, or lower --min-prs`
      : `${draft}${where}`;
  return data;
};

export interface CompareOptions {
  readonly repo: string;
  readonly config: string;
  /** The ref the head is compared against. */
  readonly base: string;
  /** A ref for the head; left out, the repository as it stands, uncommitted changes included. */
  readonly head?: string | undefined;
  readonly shell: Shell;
  readonly worktrees: Worktrees;
}

/** Every file in the inputs folder, sorted by name, with its text. */
const readInputs = (repo: string, config: CompareConfig, source: string): { readonly name: string; readonly text: string }[] => {
  const at = existing(repo, config.inputs, `the inputs field of ${source}`);
  const names = readdirSync(at, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) throw new Error(`${config.inputs} holds no input. fix: add one file per input the command reads on stdin`);
  return names.map((name) => ({ name, text: readFileSync(join(at, name), 'utf8') }));
};

/** The setup, then the command once per input, in one tree. */
const outputsIn = async (tree: {
  readonly shell: Shell;
  readonly dir: string;
  readonly ref: string;
  readonly config: CompareConfig;
  readonly inputs: readonly { readonly text: string }[];
}): Promise<Output[]> => {
  const { shell, dir, ref, config, inputs } = tree;
  if (config.setup !== undefined) {
    const setup = await shell(config.setup, { cwd: dir });
    if (setup.code !== 0) throw new Error(`setup failed at ${ref} (exit ${String(setup.code)}): ${setup.stderr.trim()}. fix: make the setup command run in a fresh checkout of ${ref}`);
  }
  const outputs: Output[] = [];
  for (const input of inputs) {
    // eslint-disable-next-line reliability/no-await-in-loop -- one input at a time, so two runs never share the tree's build output
    outputs.push(await shell(config.command, { cwd: dir, input: input.text }));
  }
  return outputs;
};

export const runCompare = async (options: CompareOptions): Promise<Data> => {
  const config = parseCompareConfig(options.config, readFileSync(existing(options.repo, options.config, '--config'), 'utf8'));
  const inputs = readInputs(options.repo, config, options.config);
  const baseTree = await options.worktrees.add(options.base);
  let base: Output[];
  try {
    base = await outputsIn({ shell: options.shell, dir: baseTree.dir, ref: options.base, config, inputs });
  } finally {
    await baseTree.remove();
  }
  const headRef = options.head ?? 'the working tree';
  let head: Output[];
  if (options.head === undefined) {
    head = await outputsIn({ shell: options.shell, dir: resolve(options.repo), ref: headRef, config, inputs });
  } else {
    const headTree = await options.worktrees.add(options.head);
    try {
      head = await outputsIn({ shell: options.shell, dir: headTree.dir, ref: headRef, config, inputs });
    } finally {
      await headTree.remove();
    }
  }
  const report = judge(
    inputs.map((input, at) => ({ input: input.name, base: base[at] as Output, head: head[at] as Output })),
    config,
  );
  const shown = compareText(report, { base: options.base, head: headRef });
  if (report.differs.length > 0) {
    throw new Error(`${shown}\n\nfix: repair the change, or add each approve entry above to approved in ${options.config} with the reason the new output is right`);
  }
  const data: Data = { base: options.base, head: headRef, ...report };
  data[TEXT] = () => shown;
  return data;
};

// No `(default: …)` in the description: burgee prints the default after it.
const repoOption = { type: 'string', default: HERE, description: 'the repository', placeholder: 'dir' } as const;
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
      run: refusing(({ options }) => runCheck({ repo: options.repo as string, config: options.config as string, cases: options.cases as string })),
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
      run: refusing(({ options }) =>
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
      ),
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
      run: refusing(({ options }) => runPropose({ repo: options.repo as string, ref: options.ref as string, limit: options.limit as number, log: logOf })),
    }),
    defineCommand({
      name: 'scorecard',
      description: 'Score how well the checks catch bugs, from history alone: escapes, receipts, recall and false alarms, each with its next fix',
      effects: 'read_only',
      examples: [
        { command: 'replz scorecard', description: 'the last 30 days on origin/main' },
        { command: 'replz scorecard --ratchet .sdlc/bands/verification-scorecard.json', description: 'fail when a measure leaves its band' },
      ],
      options: {
        repo: repoOption,
        cases: casesOption,
        ref: { type: 'string', default: 'origin/main', description: 'the history to read', placeholder: 'ref' },
        days: { type: 'number', default: DEFAULT_DAYS, description: 'how many days back a pull request counts', placeholder: 'n' },
        ratchet: { type: 'string', description: 'a JSON file of bands (maxEscapeRate, minReceipts, minRecall); exit 1 when one is broken', placeholder: 'path' },
      },
      run: refusing(({ options }) =>
        runScorecard({
          repo: options.repo as string,
          ref: options.ref as string,
          days: options.days as number,
          cases: options.cases as string,
          ratchet: options.ratchet as string | undefined,
          git: (args) => logOf(options.repo as string, args),
          now: () => new Date(),
        }),
      ),
    }),
    defineCommand({
      name: 'compare',
      description: 'Run the same inputs through the base and the head and fail on any output that changed, unless a person approved that change',
      effects: 'read_only',
      examples: [
        { command: 'replz compare', description: `every input in ${COMPARE} through origin/main and the working tree` },
        { command: 'replz compare --base v1.0.0 --head HEAD', description: 'a release against the last commit' },
      ],
      options: {
        repo: repoOption,
        config: { type: 'string', default: COMPARE, description: 'the compare config: setup, command, inputs, normalize and approved', placeholder: 'path' },
        base: { type: 'string', default: 'origin/main', description: 'the ref the head is compared against', placeholder: 'ref' },
        head: { type: 'string', description: 'a ref for the head (default: the working tree, uncommitted changes included)', placeholder: 'ref' },
      },
      run: refusing(({ options }) =>
        runCompare({
          repo: options.repo as string,
          config: options.config as string,
          base: options.base as string,
          head: options.head as string | undefined,
          shell: sh,
          worktrees: worktreesIn(options.repo as string),
        }),
      ),
    }),
    defineCommand({
      name: 'mine',
      description: 'Draft lint-rule candidates from review findings written by hand in two or more pull requests, for a person to accept',
      effects: 'idempotent',
      examples: [
        { command: 'replz mine', description: 'the patterns in the last 30 days of reviews' },
        { command: `replz mine --days 90 --write ${CANDIDATES}`, description: 'a longer window, saved as a draft file' },
      ],
      options: {
        repo: repoOption,
        slug: { type: 'string', description: 'the GitHub repository, owner/name (default: the one gh resolves in --repo)', placeholder: 'owner/name' },
        days: { type: 'number', default: DEFAULT_DAYS, description: 'how many days of review comments to read', placeholder: 'n' },
        minPrs: { type: 'number', default: 2, description: 'the pull requests a pattern needs', placeholder: 'n' },
        limit: { type: 'number', default: DEFAULT_CANDIDATES, description: 'the most candidates to draft', placeholder: 'n' },
        write: { type: 'string', description: `write the draft to this file under --repo, e.g. ${CANDIDATES}`, placeholder: 'path' },
      },
      run: refusing(({ options }) =>
        runMine({
          repo: options.repo as string,
          slug: options.slug as string | undefined,
          days: options.days as number,
          minPrs: options.minPrs as number,
          limit: options.limit as number,
          write: options.write as string | undefined,
          gh: (args) => ghOf(options.repo as string, args),
          now: () => new Date(),
        }),
      ),
    }),
  ],
});
