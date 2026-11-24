/**
 * Draft cases from history (replz intent, "Defaults taken"): a revert on main names the pull request
 * that broke something, and a fix that says which pull request it fixes names another. Each draft
 * is that pull request's squash commit as `head` and its parent as `base`; the answer key is left for
 * a person, because a finding is graded against it and a guessed key grades nothing. Controls are
 * merged pull requests of a similar size that no revert or fix names.
 */
import { type Case, PLACEHOLDER } from './cases.js';

/** One commit on main. */
export interface Commit {
  readonly sha: string;
  readonly parent: string;
  readonly subject: string;
  readonly body: string;
  /** Lines added and removed. */
  readonly size: number;
}

/** The `git log` arguments whose output `parseLog` reads. */
export const LOG_ARGS = ['log', '--first-parent', '--shortstat', '--format=%x00%H%x09%P%x09%s%x09%b%x01'] as const;

const PR_IN_SUBJECT = /\(#(\d+)\)$/;
/** A revert, pushed straight or squash-merged with its own pull request number after it. */
const REVERTED = /^Revert "(.*)"(?: \(#\d+\))?$/;
const FIXES = /\b(?:fixes|regressed in|introduced in|broken by|shipped in|since)\s+#(\d+)/i;

/** Lines added and removed, from a `--shortstat` line such as ` 2 files changed, 10 insertions(+), 3 deletions(-)`. Split, not matched: a regex over the digits would be slow on a long run of them. */
const linesIn = (stat: string): number =>
  stat
    .split(',')
    .map((part) => part.trim().split(' '))
    .filter(([, word]) => word !== undefined && (word.startsWith('insertion') || word.startsWith('deletion')))
    .reduce((sum, [count]) => sum + Number(count), 0);

export const prOf = (subject: string): number | undefined => {
  const found = PR_IN_SUBJECT.exec(subject.trim())?.[1];
  return found === undefined ? undefined : Number(found);
};

const isFix = (subject: string): boolean => subject.startsWith('fix');

/** The pull requests a commit says were bugs: the one a revert undoes, or the one a fix names. */
export const blamed = (commit: Commit): number[] => {
  const reverted = REVERTED.exec(commit.subject)?.[1];
  const fromRevert = reverted === undefined ? undefined : prOf(reverted);
  const named = isFix(commit.subject) ? FIXES.exec(`${commit.subject}\n${commit.body}`)?.[1] : undefined;
  const fromFix = named === undefined ? undefined : Number(named);
  return [fromRevert, fromFix].filter((pr) => pr !== undefined);
};

/** Read what `git <LOG_ARGS>` prints: per commit, its fields, then the body's end mark, then its stat. */
export const parseLog = (log: string): Commit[] =>
  log
    .split('\0')
    .filter((record) => record.includes('\u0001'))
    .map((record) => {
      // Stryker disable next-line StringLiteral: equivalent, a record kept holds the end mark, so both parts are there
      const [fields = '', stat = ''] = record.split('\u0001');
      // A split always gives the first field, the sha.
      const [sha, parents = '', subject = '', ...body] = fields.split('\t') as [string, ...string[]];
      return { sha, parent: parents.split(' ')[0] as string, subject, body: body.join('\t').trim(), size: linesIn(stat) };
    });

export interface Proposal {
  readonly bugs: readonly Case[];
  readonly controls: readonly Case[];
}

/** Enough of a sha to be unique in any repository this runs on, and short enough to read. */
const SHORT = 12;

const caseOf = (commit: Commit, pr: number, kind: Case['kind'], set: Case['set']): Case => ({
  id: `${kind}-${String(pr)}`,
  kind,
  pr,
  base: commit.parent.slice(0, SHORT),
  head: commit.sha.slice(0, SHORT),
  set,
});

/**
 * Bug drafts for every blamed pull request found on main, newest first, alternating test and tune
 * so neither set is all old or all new; and per bug, the nearest-sized unblamed pull request as its
 * control, never one used twice.
 */
export const propose = (commits: readonly Commit[], limit: number): Proposal => {
  const byPr = new Map(commits.flatMap((commit) => {
    const pr = prOf(commit.subject);
    return pr === undefined ? [] : [[pr, commit] as const];
  }));
  const blamedPrs = [...new Set(commits.flatMap(blamed))].filter((pr) => byPr.has(pr)).slice(0, limit);
  const bugs = blamedPrs.map((pr, index) => caseOf(byPr.get(pr) as Commit, pr, 'bug', index % 2 === 0 ? 'test' : 'tune'));
  const blamedSet = new Set(commits.flatMap(blamed));
  const pool = [...byPr.entries()].filter(([pr, commit]) => !blamedSet.has(pr) && !REVERTED.test(commit.subject) && !/^fix\b/.test(commit.subject));
  const controls: Case[] = [];
  for (const bug of bugs) {
    const size = (byPr.get(bug.pr) as Commit).size;
    const nearest = pool.toSorted(([, a], [, b]) => Math.abs(a.size - size) - Math.abs(b.size - size))[0];
    if (nearest === undefined) break;
    pool.splice(pool.indexOf(nearest), 1);
    controls.push(caseOf(nearest[1], nearest[0], 'control', bug.set));
  }
  return { bugs, controls };
};

/** A draft case file; a bug's answer is left for a person to write. */
export const toYaml = (found: Case, subject: string): string =>
  [
    `# ${subject}`,
    `id: ${found.id}`,
    `kind: ${found.kind}`,
    `pr: ${String(found.pr)}`,
    // Quoted: a sha of digits alone reads as a number.
    `base: ${JSON.stringify(found.base)}`,
    `head: ${JSON.stringify(found.head)}`,
    ...(found.kind === 'bug' ? [`answer: ${PLACEHOLDER} one sentence saying what the bug is, from the revert or the fix`] : []),
    `set: ${found.set}`,
    '',
  ].join('\n');
