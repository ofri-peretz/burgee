/**
 * triggerlist's commands, declared once so burgee projects each to `--json`, `--schema`, `--mcp`
 * and completions. Every command takes `--repo` (default: the current directory) and does its work
 * through a function a test calls with its own git.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { defineCommand, defineProgram, ExitCode } from 'burgee';

import { briefText, type Comment, markerFor, previousRound, type Reply, repliesSince } from './brief.js';
import { CHECKLIST, type Checklist, parseChecklist } from './checklist.js';
import { compile, DEFAULT_BUDGET } from './compile.js';
import { parseDiff } from './diff.js';
import { type Git, gitIn } from './git.js';
import { match, toText as matchText, where } from './match.js';
import { protect, toText as protectText } from './protect.js';
import { fromDecision, fromLockTest, type Source, testCommand, toYaml, VITEST_CONFIG } from './seed.js';

export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

const TEXT = Symbol.for('burgee.text');

type Data = Record<string | symbol, unknown>;

// Stryker disable next-line StringLiteral: equivalent, `resolve('', x)` and `resolve('.', x)` are both the working directory
const HERE = '.';

/** The checklist from the base branch, or from the working tree when asked: the source and the parsed list. */
export const loadChecklist = async (repo: string, git: Git, path: string, base: string | undefined): Promise<{ source: string; checklist: Checklist }> => {
  if (base === undefined) return { source: path, checklist: parseChecklist(path, readFileSync(resolve(repo, path), 'utf8')) };
  const source = `${base}:${path}`;
  return { source, checklist: parseChecklist(source, await git.show(base, path)) };
};

export interface RangeOptions {
  readonly repo: string;
  readonly git: Git;
  readonly base: string;
  readonly checklist: string;
  /** Read the checklist from the working tree instead of the base branch: for writing it, never for CI. */
  readonly worktree: boolean;
}

const range = (base: string): string => `${base}...HEAD`;

/**
 * The checklist `match`, `protect` and `brief` read, or none when the base ref has no checklist file
 * yet: the pull request that adds a repo's first checklist has nothing to match and no gate to
 * protect. Only a missing file is let through; a checklist that is there and does not parse still
 * fails, so a broken base checklist cannot turn `protect --enforce` into a pass. A ref the checkout
 * lacks fails at the diff.
 */
const baseChecklist = async (options: RangeOptions): Promise<{ source: string; checklist: Checklist | undefined }> => {
  if (options.worktree) return await loadChecklist(options.repo, options.git, options.checklist, undefined);
  const source = `${options.base}:${options.checklist}`;
  const text = await options.git.show(options.base, options.checklist).catch(() => undefined);
  return { source, checklist: text === undefined ? undefined : parseChecklist(source, text) };
};

export const runMatch = async (options: RangeOptions): Promise<Data> => {
  const { source, checklist } = await baseChecklist(options);
  const changed = parseDiff(await options.git.diff(range(options.base)));
  const fired = checklist === undefined ? [] : match(checklist, changed);
  const data: Data = {
    range: range(options.base),
    checklist: source,
    fired: fired.map(({ item, at }) => ({ id: item.id, question: item.question, check: item.check, sources: item.sources, at: at.map(where) })),
    ...(checklist === undefined ? { bootstrap: true } : {}),
  };
  data[TEXT] = () => (checklist === undefined ? `${source} does not exist yet: no checklist item to match` : matchText(fired, range(options.base)));
  return data;
};

export const runProtect = async (options: RangeOptions & { readonly enforce: boolean }): Promise<Data> => {
  const { source, checklist } = await baseChecklist(options);
  if (checklist === undefined) {
    const data: Data = { range: range(options.base), checklist: source, mode: options.enforce ? 'enforce' : 'observe', gates: [], code: [], flagged: false, bootstrap: true };
    data[TEXT] = () => `${source} does not exist yet: no gate to protect, so nothing is checked`;
    return data;
  }
  const paths = parseDiff(await options.git.diff(range(options.base))).map((file) => file.path);
  const result = protect(paths, checklist.gates);
  const failed = result.flagged && options.enforce;
  const data: Data = {
    range: range(options.base),
    checklist: source,
    mode: options.enforce ? 'enforce' : 'observe',
    ...result,
    ...(failed ? { exitCode: ExitCode.RUNTIME, fix: 'land the gate change in its own pull request first' } : {}),
  };
  data[TEXT] = () => protectText(result, range(options.base), options.enforce);
  return data;
};

export interface BriefOptions extends RangeOptions {
  /** The rules file, read from the base branch. */
  readonly review: string;
  /** The commit under review, recorded in the marker so the next round knows what it saw. */
  readonly head: string;
  /** A JSON file of the PR's comments, as `gh api .../issues/<n>/comments` prints them. */
  readonly comments?: string | undefined;
  /**
   * A JSON file of the author's PR comments and review-thread replies, in the same shape; those
   * posted after the previous round reach the reviewer.
   */
  readonly replies?: string | undefined;
}

export const runBrief = async (options: BriefOptions): Promise<Data> => {
  // The pull request that adds a repo's first REVIEW.md or checklist has neither on its base: brief
  // it with no rules and no items rather than failing the review.
  const rulesText = await options.git.show(options.base, options.review).catch(() => `(${options.base}:${options.review} does not exist yet: review against the repo's own instructions)`);
  const { source, checklist } = await baseChecklist(options);
  const fired = checklist === undefined ? [] : match(checklist, parseDiff(await options.git.diff(range(options.base))));
  const comments = options.comments === undefined ? [] : (JSON.parse(readFileSync(resolve(options.repo, options.comments), 'utf8')) as Comment[]);
  const round = previousRound(comments);
  const previous = round?.body ?? undefined;
  const replies = previous === undefined || options.replies === undefined ? [] : repliesSince(JSON.parse(readFileSync(resolve(options.repo, options.replies), 'utf8')) as Reply[], round?.created_at);
  const rules = `${options.base}:${options.review}`;
  const data: Data = {
    rules,
    range: range(options.base),
    checklist: source,
    fired: fired.map(({ item, at }) => ({ id: item.id, at: at.map(where) })),
    previous: previous !== undefined,
    replies: replies.length,
    head: options.head,
    marker: markerFor(options.head),
  };
  data[TEXT] = () => briefText({ rules, rulesText, range: range(options.base), fired, previous, replies, head: options.head });
  return data;
};

/** The file's text, or `undefined` when there is none yet. */
const readIfThere = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

export interface CompileOptions {
  readonly repo: string;
  readonly checklist: string;
  readonly out: string;
  readonly budget: number;
  /** A JSON file of `{ "<id>": <firings> }`, as `replz` reports them. */
  readonly firings?: string | undefined;
  /** Write nothing; fail when the file on disk is not what compile would write. */
  readonly check: boolean;
}

export const runCompile = (options: CompileOptions): Data => {
  const checklist = parseChecklist(options.checklist, readFileSync(resolve(options.repo, options.checklist), 'utf8'));
  const firings = options.firings === undefined ? {} : (JSON.parse(readFileSync(resolve(options.repo, options.firings), 'utf8')) as Record<string, number>);
  const compiled = compile(checklist, options.checklist, options.budget, firings);
  const target = resolve(options.repo, options.out);
  const before = readIfThere(target);
  const stale = before !== compiled.text;
  const base = { out: options.out, rules: checklist.items.length, bytes: compiled.bytes, budget: compiled.budget };
  let data: Data;
  if (compiled.drop.length > 0) {
    data = { ...base, changed: false, drop: compiled.drop, exitCode: ExitCode.RUNTIME, fix: `drop the least-fired rules: ${compiled.drop.join(', ')}` };
    data[TEXT] = () => `${options.out} would be ${String(compiled.bytes)} bytes, over the ${String(compiled.budget)}-byte budget. fix: drop the least-fired rules: ${compiled.drop.join(', ')}`;
  } else if (options.check) {
    data = { ...base, changed: false, stale, ...(stale ? { exitCode: ExitCode.RUNTIME, fix: 'run `triggerlist compile` and commit the result' } : {}) };
    data[TEXT] = () => (stale ? `${options.out} is not what the checklist compiles to. fix: run \`triggerlist compile\` and commit the result` : `${options.out} is up to date`);
  } else {
    if (stale) writeFileSync(target, compiled.text);
    data = { ...base, changed: stale };
    data[TEXT] = () => `${stale ? 'wrote' : 'unchanged:'} ${options.out}, ${String(checklist.items.length)} rule(s), ${String(compiled.bytes)} of ${String(compiled.budget)} bytes`;
  }
  return data;
};

/** Each file in `dir` whose name passes `keep`, as a repo-relative source; none when the folder is missing. */
const sources = (repo: string, dir: string, keep: (name: string) => boolean): Source[] => {
  const full = resolve(repo, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter(keep)
    .sort()
    .map((name) => ({ path: `${dir}/${name}`, text: readFileSync(join(full, name), 'utf8') }));
};

export interface SeedOptions {
  readonly repo: string;
  readonly checklist: string;
  readonly locks: string;
  readonly decisions: string;
}

export const runSeed = (options: SeedOptions): Data => {
  const configs = sources(options.repo, HERE, (name) => VITEST_CONFIG.test(name)).map(({ path, text }) => ({ path: path.slice(`${HERE}/`.length), text }));
  const runner = testCommand(configs, readIfThere(resolve(options.repo, 'package.json')) ?? '', options.locks);
  const existing = existsSync(resolve(options.repo, options.checklist))
    ? new Set(parseChecklist(options.checklist, readFileSync(resolve(options.repo, options.checklist), 'utf8')).items.map((item) => item.id))
    : new Set<string>();
  const items = [
    ...sources(options.repo, options.locks, (name) => name.endsWith('-lock.test.ts')).map((source) => fromLockTest(source, runner)),
    ...sources(options.repo, options.decisions, (name) => name.endsWith('.md')).map(fromDecision),
  ].filter((item) => item !== undefined);
  const fresh = items.filter((item) => !existing.has(item.id));
  const data: Data = { drafted: fresh.length, skipped: items.length - fresh.length, items: fresh };
  data[TEXT] = () => toYaml(fresh, existing);
  return data;
};

const repoOption = { type: 'string', default: HERE, description: 'the repository to read (default: the current directory)', placeholder: 'dir' } as const;
const checklistOption = { type: 'string', default: CHECKLIST, description: 'the checklist file', placeholder: 'path' } as const;
const worktreeOption = { type: 'boolean', description: 'read the checklist from the working tree, not the base branch (for editing it; never in CI)' } as const;

const rangeOptions = (args: Record<string, unknown>, options: Record<string, unknown>): RangeOptions => ({
  repo: options.repo as string,
  git: gitIn(options.repo as string),
  base: args.base as string,
  checklist: options.checklist as string,
  worktree: options.worktree === true,
});

export const program = defineProgram({
  name: 'triggerlist',
  version: VERSION,
  description: 'The review checklist a diff selects, read from the base branch so a change cannot edit its own checks',
  commands: [
    defineCommand({
      name: 'match',
      description: 'The checklist items whose triggers fire on <base>...HEAD, each with where it fired',
      effects: 'read_only',
      examples: [{ command: 'triggerlist match origin/main', description: 'the items a reviewer of this branch answers' }],
      arguments: [{ name: 'base', description: 'the base ref; the checklist is read from it too' }],
      options: { repo: repoOption, checklist: checklistOption, worktree: worktreeOption },
      run: ({ args, options }) => runMatch(rangeOptions(args, options)),
    }),
    defineCommand({
      name: 'brief',
      description: "The reviewer's brief for one round: the base branch's REVIEW.md, the items that fire, the previous round's findings, the author's replies since and the commit under review",
      effects: 'read_only',
      examples: [{ command: 'triggerlist brief origin/main --head "$HEAD_SHA" --comments comments.json', description: 'the prompt a CI review step hands its reviewer' }],
      arguments: [{ name: 'base', description: 'the base ref; REVIEW.md and the checklist are read from it' }],
      options: {
        repo: repoOption,
        checklist: checklistOption,
        worktree: worktreeOption,
        review: { type: 'string', default: 'REVIEW.md', description: 'the rules file, read from the base ref', placeholder: 'path' },
        head: { type: 'string', required: true, description: 'the commit under review', placeholder: 'sha' },
        comments: { type: 'string', description: "a JSON file of the pull request's comments, for the previous round's findings", placeholder: 'path' },
        replies: { type: 'string', description: "a JSON file of the author's comments and review-thread replies; those after the previous round reach the reviewer", placeholder: 'path' },
      },
      run: ({ args, options }) =>
        runBrief({ ...rangeOptions(args, options), review: options.review as string, head: options.head as string, comments: options.comments as string | undefined, replies: options.replies as string | undefined }),
    }),
    defineCommand({
      name: 'protect',
      description: 'Flag a change that edits a gate file and the code the gates judge together',
      effects: 'read_only',
      examples: [{ command: 'triggerlist protect origin/main --enforce', description: 'fail when a gate and code change together' }],
      arguments: [{ name: 'base', description: 'the base ref; the gate list is read from it too' }],
      options: {
        repo: repoOption,
        checklist: checklistOption,
        worktree: worktreeOption,
        enforce: { type: 'boolean', description: 'exit 1 when flagged (default: observe, report only)' },
      },
      run: ({ args, options }) => runProtect({ ...rangeOptions(args, options), enforce: options.enforce === true }),
    }),
    defineCommand({
      name: 'compile',
      description: 'Write REVIEW.md from the checklist, one line per rule, under a byte budget',
      effects: 'idempotent',
      examples: [
        { command: 'triggerlist compile', description: 'write REVIEW.md' },
        { command: 'triggerlist compile --check', description: 'fail when REVIEW.md is stale' },
      ],
      options: {
        repo: repoOption,
        checklist: checklistOption,
        out: { type: 'string', default: 'REVIEW.md', description: 'the file to write', placeholder: 'path' },
        budget: { type: 'number', default: DEFAULT_BUDGET, description: 'the most bytes it may be', placeholder: 'bytes' },
        firings: { type: 'string', description: 'a JSON file of firing counts per item id, to choose which rules to drop', placeholder: 'path' },
        check: { type: 'boolean', description: 'write nothing; exit 1 when the file is stale' },
      },
      run: ({ options }) =>
        runCompile({
          repo: options.repo as string,
          checklist: options.checklist as string,
          out: options.out as string,
          budget: options.budget as number,
          firings: options.firings as string | undefined,
          check: options.check === true,
        }),
    }),
    defineCommand({
      name: 'seed',
      description: 'Draft checklist items from lock-test headers and decision files, printed for a person to edit',
      effects: 'read_only',
      examples: [{ command: 'triggerlist seed > draft.yaml', description: 'draft items to narrow and move into the checklist' }],
      options: {
        repo: repoOption,
        checklist: checklistOption,
        locks: { type: 'string', default: 'scripts', description: 'the folder of *-lock.test.ts files', placeholder: 'dir' },
        decisions: { type: 'string', default: '.sdlc/decisions', description: 'the folder of decision files', placeholder: 'dir' },
      },
      run: ({ options }) =>
        runSeed({ repo: options.repo as string, checklist: options.checklist as string, locks: options.locks as string, decisions: options.decisions as string }),
    }),
  ],
});
