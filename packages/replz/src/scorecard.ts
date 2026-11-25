/**
 * The verification scorecard (replz-scorecard intent): how well a repository's checks catch bugs, read
 * from its own history with no model call, so it runs free in every repository on a schedule.
 *
 * The names follow Anthropic's: an **escape** is a merged pull request a later revert or fix traced
 * back to (the Claude Code verification post builds its bug set from reverts and fixes); **recall**
 * and **false alarms** are replz's own run, per stage; a **receipt** is provedone's `Verified-by:`.
 * Every measure carries a `next` action, so the number points at the fix, not at a meeting.
 *
 * A fix that does not name the pull request it repairs is traced with SZZ (Śliwerski, Zimmermann and
 * Zeller, 2005): the lines the fix removed or changed are blamed at its parent, and the commits that
 * last touched them are the suspects. Only code is traced: a fix's test, doc or lockfile lines say
 * nothing about where the bug came from.
 */
import { verdict } from 'provedone/receipt';

import { blamed, prOf } from './propose.js';
import { type Report } from './score.js';

/** One first-parent commit on main. */
export interface MainCommit {
  readonly sha: string;
  /** `yyyy-mm-dd`, the commit date. */
  readonly date: string;
  readonly subject: string;
  readonly body: string;
}

/** The `git log` arguments whose output `parseMainLog` reads. */
export const MAIN_LOG_ARGS = ['log', '--first-parent', '--format=%x00%H%x09%cs%x09%s%x09%b%x01'] as const;

export const parseMainLog = (log: string): MainCommit[] =>
  log
    .split('\0')
    .filter((record) => record.includes('\u0001'))
    .map((record) => {
      // A record kept holds the end mark, and `--format` prints every field, empty or not.
      const [sha, date, subject, ...body] = record.slice(0, record.indexOf('\u0001')).split('\t') as [string, string, string, ...string[]];
      return { sha, date, subject, body: body.join('\t').trim() };
    });

/** A release or version bump is the bot's, not a change anyone verified. */
export const isRelease = (subject: string): boolean => /^chore\(release\)|^Version Packages\b/iu.test(subject);

/** A fix that follows an upstream release repairs nothing we got wrong: the line was right when written. */
const UPSTREAM = /:\s*(?:follow|re-?vendor|re-?grade|bump)\b/iu;

/** A fix to behaviour, not to docs: `fix:`, `fix(scope):`, `fix!:`, except `fix(docs)`. */
export const isFix = (subject: string): boolean => /^fix(?:\([^)]*\))?!?:/u.test(subject) && !/^fix\((?:docs?|deps)\)/u.test(subject) && !UPSTREAM.test(subject);

export const isRevert = (subject: string): boolean => subject.startsWith('Revert "');

/** Code whose lines can carry a bug; tests, fixtures, docs, snapshots and generated files cannot. */
export const isCode = (path: string): boolean =>
  /\.(?:[cm]?[jt]sx?|vue|sh)$/u.test(path) && !/(?:^|\/)(?:__tests__|__fixtures__|__snapshots__|fixtures|dist|node_modules)\/|\.(?:test|spec|bench)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/u.test(path);

/** A line range of the old side of a diff: what the fix removed or changed. */
export interface OldRange {
  readonly path: string;
  readonly start: number;
  readonly count: number;
}

/**
 * A removed line that carries no behaviour: blank, a comment, or an import. Blaming one finds who
 * last reworded or reordered it, not who wrote a bug, so SZZ skips it (the triage of burgee's first
 * 75 traced escapes, 2026-11-25, found these the commonest wrong suspects).
 */
export const isInert = (text: string): boolean => {
  const line = text.trim();
  return line === '' || /^(?:\/\/|\/\*|\*|#(?!!))/u.test(line) || /^import\b/u.test(line) || /^export \{[^}]*\} from\b/u.test(line);
};

/** Lines in a row become one range, so each blame call covers as much as it can. */
const pushLine = (ranges: OldRange[], path: string, line: number): void => {
  const last = ranges.at(-1);
  if (last?.path === path && last.start + last.count === line) ranges[ranges.length - 1] = { ...last, count: last.count + 1 };
  else ranges.push({ path, start: line, count: 1 });
};

/** The old-side lines of a `git diff -U0` in code files that a fix removed or changed, skipping inert ones, as ranges. */
export const oldRanges = (diff: string): OldRange[] => {
  const ranges: OldRange[] = [];
  let path: string | undefined;
  // Stryker disable next-line NumericLiteral: equivalent, a hunk header sets it before any removed line
  let line = 0;
  for (const text of diff.split('\n')) {
    // A new file's old side is /dev/null, and it removes no line, so only a named old side matters.
    // Stryker disable next-line Regex: equivalent, `diff -U0` prints no context line for `--- ` to start mid-line or carry a tail
    const file = /^--- a\/(.+)$/u.exec(text)?.[1];
    if (text.startsWith('--- ')) {
      // Stryker disable next-line ConditionalExpression: equivalent, isCode reads no undefined path as code
      path = file !== undefined && isCode(file) ? file : undefined;
      continue;
    }
    const hunk = /^@@ -(\d+)/u.exec(text);
    if (hunk !== null) line = Number(hunk[1]);
    else if (path !== undefined && text.startsWith('-')) {
      if (!isInert(text.slice(1))) pushLine(ranges, path, line);
      line += 1;
    }
  }
  return ranges;
};

/** The commits a `git blame --porcelain` names, once each. */
export const blameShas = (porcelain: string): string[] => [...new Set(porcelain.split('\n').flatMap((line) => /^([0-9a-f]{40}) \d+ \d/u.exec(line)?.slice(1) ?? []))];

/** Where escapes a person or agent dismissed are kept, each pull request with its reason. */
export const TRIAGE = '.sdlc/replz/triage.json';

/** Runs git in the repository and returns its stdout. */
export type Git = (args: readonly string[]) => Promise<string>;

/** A fix that touches more than this many ranges is a rewrite; its first ranges are traced, the rest not. */
export const MAX_RANGES = 40;

/** The commits whose lines `fix` removed or changed, by SZZ. */
export const traceFix = async (git: Git, fix: string): Promise<string[]> => {
  const ranges = oldRanges(await git(['diff', '-U0', '--no-color', '--no-ext-diff', `${fix}^`, fix])).slice(0, MAX_RANGES);
  const found = new Set<string>();
  for (const range of ranges) {
    // eslint-disable-next-line reliability/no-await-in-loop -- one blame at a time: each walks history, and parallel blames thrash the pack cache
    const porcelain = await git(['blame', '-w', '-M', '-C', '--porcelain', '-L', `${String(range.start)},+${String(range.count)}`, `${fix}^`, '--', range.path]);
    for (const sha of blameShas(porcelain)) found.add(sha);
  }
  return [...found];
};

/** A merged pull request that a later revert or fix traced back to. */
export interface Escape {
  readonly pr: number;
  readonly subject: string;
  readonly date: string;
  /** The pull requests (or commits, when pushed straight) of the reverts and fixes that point at it. */
  readonly fixedBy: readonly string[];
  /** `named`: a revert or fix says so; `traced`: SZZ blame found it. */
  readonly how: 'named' | 'traced';
  /** `confirmed`: a replz bug case holds it; `dismissed`: the triage file says why not; `suspect`: neither yet. */
  readonly status: 'confirmed' | 'dismissed' | 'suspect';
}

export interface Measure {
  readonly value: number | null;
  readonly of: string;
  readonly next: string;
}

export interface Scorecard {
  readonly since: string;
  readonly merged: number;
  readonly fixes: number;
  /** Fixes that added lines only, so SZZ has nothing to blame. */
  readonly untraced: number;
  readonly escapes: readonly Escape[];
  readonly escapeRate: Measure;
  readonly receipts: Measure;
  readonly recall: Measure;
  readonly falseAlarms: Measure;
  /** Escapes in the window by triage status. */
  readonly triage: { readonly confirmed: number; readonly dismissed: number; readonly suspect: number };
  /** Escapes in the window that are neither a case nor dismissed: the triage backlog, newest first. */
  readonly uncased: readonly number[];
  /** Merged pull requests without a receipt, newest first. */
  readonly unreceipted: readonly number[];
}

/** The last `replz run --record` entry, as much of it as the scorecard reads. */
export interface HistoryEntry {
  readonly date: string;
  readonly set: string;
  readonly report: Pick<Report, 'bugs' | 'controls' | 'recall' | 'falseAlarms'>;
}

export interface ScorecardInput {
  /** Every first-parent commit on main, newest first. */
  readonly commits: readonly MainCommit[];
  /** `yyyy-mm-dd`: pull requests merged on or after it are scored. */
  readonly since: string;
  /** For each fix in the window that names no pull request, the commits SZZ traced it to. */
  readonly traced: ReadonlyMap<string, readonly string[]>;
  /** The pull requests that already have a replz case. */
  readonly cased: ReadonlySet<number>;
  /** The pull requests a person or agent dismissed as escapes, each with its reason (`TRIAGE`). */
  readonly dismissed?: ReadonlyMap<number, string> | undefined;
  readonly history?: HistoryEntry | undefined;
}

/** Rates are kept to three decimals: a tenth of a percent, the finest the text prints. */
const PRECISION = 1000;
const PERCENT = 100;
const rate = (part: number, whole: number): number | null => (whole === 0 ? null : Math.round((part / whole) * PRECISION) / PRECISION);
const pct = (value: number | null): string => (value === null ? 'unmeasured' : `${(value * PERCENT).toFixed(1)}%`);
const LIST = 5;
const list = (prs: readonly number[]): string => prs.slice(0, LIST).map((pr) => `#${String(pr)}`).join(', ') + (prs.length > LIST ? ` and ${String(prs.length - LIST)} more` : '');

/** Enough of a sha to be unique in any repository this runs on. */
const SHORT = 12;

/** The id of a fix or revert: its pull request, or its short sha when it was pushed straight. */
const idOf = (commit: MainCommit): string => {
  const pr = prOf(commit.subject);
  return pr === undefined ? commit.sha.slice(0, SHORT) : `#${String(pr)}`;
};

/** Each commit by its pull request; a commit pushed straight has none, and no number looks it up. */
const byPrOf = (commits: readonly MainCommit[]): Map<number | undefined, MainCommit> => new Map(commits.map((commit) => [prOf(commit.subject), commit]));

interface Found {
  readonly escapes: Omit<Escape, 'status'>[];
  readonly untraced: number;
}

/** The pull requests the fixes point at: by name when a fix names one, else by its SZZ suspects. */
const findEscapes = (commits: readonly MainCommit[], fixes: readonly MainCommit[], traced: ScorecardInput['traced']): Found => {
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]));
  const byPr = byPrOf(commits);
  const pointers = new Map<number, { named: boolean; fixedBy: Set<string> }>();
  const point = (pr: number, named: boolean, by: MainCommit): void => {
    const target = byPr.get(pr);
    if (target === undefined || isRelease(target.subject) || target.sha === by.sha) return;
    const entry = pointers.get(pr);
    // A name outranks a trace: once any fix names it, it is named.
    pointers.set(pr, { named: named || entry?.named === true, fixedBy: (entry?.fixedBy ?? new Set<string>()).add(idOf(by)) });
  };
  const suspectsOf = (fix: MainCommit): number[] =>
    // Stryker disable next-line ArrayDeclaration: equivalent, a sha no commit has names no pull request
    (traced.get(fix.sha) ?? []).flatMap((sha) => {
      // Stryker disable next-line StringLiteral: equivalent, any subject without `(#n)` names no pull request
      const pr = prOf(bySha.get(sha)?.subject ?? '');
      return pr === undefined ? [] : [pr];
    });
  let untraced = 0;
  for (const fix of fixes) {
    const named = blamed(fix);
    // A fix that names its pull request is not traced.
    // Stryker disable next-line ArrayDeclaration: equivalent, a named fix is never untraced, and a suspect no commit names points at nothing
    const suspects = named.length > 0 ? [] : suspectsOf(fix);
    // Stryker disable next-line ArithmeticOperator: equivalent, one of the two is always empty
    if (named.length + suspects.length === 0) untraced += 1;
    for (const pr of named) point(pr, true, fix);
    for (const pr of suspects) point(pr, false, fix);
  }
  const escapes = [...pointers.entries()]
    .map(([pr, { named, fixedBy }]): Omit<Escape, 'status'> => {
      const commit = byPr.get(pr) as MainCommit;
      return { pr, subject: commit.subject, date: commit.date, fixedBy: [...fixedBy].sort(), how: named ? 'named' : 'traced' };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.pr - a.pr);
  return { escapes, untraced };
};

export const scorecard = (input: ScorecardInput): Scorecard => {
  const inWindow = input.commits.filter((commit) => commit.date >= input.since);
  const merged = inWindow.filter((commit) => prOf(commit.subject) !== undefined && !isRelease(commit.subject));
  const mergedPrs = new Set(merged.map((commit) => prOf(commit.subject) as number));
  const fixes = inWindow.filter((commit) => isFix(commit.subject) || isRevert(commit.subject));
  const { escapes, untraced } = findEscapes(input.commits, fixes, input.traced);
  const dismissed = input.dismissed ?? new Map<number, string>();
  const statusOf = (pr: number): Escape['status'] => {
    if (input.cased.has(pr)) return 'confirmed';
    return dismissed.has(pr) ? 'dismissed' : 'suspect';
  };
  const triaged = escapes.map((escape) => ({ ...escape, status: statusOf(escape.pr) }));
  const inWindowEscapes = triaged.filter((escape) => mergedPrs.has(escape.pr));
  const count = (status: Escape['status']): number => inWindowEscapes.filter((escape) => escape.status === status).length;
  const triage = { confirmed: count('confirmed'), dismissed: count('dismissed'), suspect: count('suspect') };
  const uncased = inWindowEscapes.filter((escape) => escape.status === 'suspect').map((escape) => escape.pr);
  const unreceipted = merged.filter((commit) => !verdict(`${commit.subject}\n\n${commit.body}`).ok).map((commit) => prOf(commit.subject) as number);
  return {
    since: input.since,
    merged: merged.length,
    fixes: fixes.length,
    untraced,
    escapes: triaged,
    escapeRate: escapeMeasure(triage, merged.length, uncased),
    receipts: receiptMeasure(merged.length, unreceipted),
    ...runMeasures(input.history),
    triage,
    uncased,
    unreceipted,
  };
};

/** A dismissed escape is not one: the rate counts the confirmed and those not triaged yet. */
const escapeMeasure = (triage: Scorecard['triage'], merged: number, uncased: readonly number[]): Measure => ({
  value: rate(triage.confirmed + triage.suspect, merged),
  of: `${String(triage.confirmed + triage.suspect)} of ${String(merged)} merged pull requests: ${String(triage.confirmed)} confirmed, ${String(triage.suspect)} to triage, ${String(triage.dismissed)} dismissed`,
  next: escapeNext(triage, uncased),
});

const escapeNext = (triage: Scorecard['triage'], uncased: readonly number[]): string => {
  if (uncased.length > 0) return `confirm each suspect as a replz case with an answer key, or dismiss it in ${TRIAGE} with a reason: ${list(uncased)}`;
  return triage.confirmed === 0 ? 'no escape: keep the checks' : 'every escape is triaged: `replz run` scores whether a check catches the confirmed ones';
};

const receiptMeasure = (merged: number, unreceipted: readonly number[]): Measure => ({
  value: rate(merged - unreceipted.length, merged),
  of: `${String(merged - unreceipted.length)} of ${String(merged)} merged pull requests`,
  next:
    unreceipted.length === 0
      ? 'every merged pull request carries a receipt: gate on it (provedone gate --enforce)'
      : `add the provedone gate so no pull request merges without \`Verified-by:\`; missing on ${list(unreceipted)}`,
});

const RUN_NEXT = 'run `replz run --set test --record` to score the reviewer and the checks on the case set';
const UNRUN: Measure = { value: null, of: 'no recorded run', next: RUN_NEXT };

/** Recall at the last stage and false alarms on the controls, from the last recorded run. */
const runMeasures = (history: HistoryEntry | undefined): Pick<Scorecard, 'recall' | 'falseAlarms'> => {
  const last = history?.report.recall.at(-1);
  if (last === undefined) return { recall: UNRUN, falseAlarms: UNRUN };
  const { report, date } = history as HistoryEntry;
  return {
    recall: {
      value: rate(last.found, report.bugs),
      of: `${String(last.found)} of ${String(report.bugs)} bug cases at stage ${last.stage}, ${date}`,
      next: 'for each missed case, add the lint rule, lock test or checklist item that would have caught it',
    },
    falseAlarms: {
      value: rate(report.falseAlarms, report.controls),
      of: `${String(report.falseAlarms)} of ${String(report.controls)} clean controls`,
      next: 'drop or narrow the check or item that fired on a clean control',
    },
  };
};

const NAME_WIDTH = 13;
const VALUE_WIDTH = 11;
const GAP = 2;
/** The escapes the text lists; `--json` holds every one. */
const SHOWN = 10;

const row = (name: string, measure: Measure): string[] => [
  `${name.padEnd(NAME_WIDTH)}${pct(measure.value).padStart(VALUE_WIDTH)}${' '.repeat(GAP)}${measure.of}`,
  `${' '.repeat(NAME_WIDTH + VALUE_WIDTH + GAP)}next: ${measure.next}`,
];

/** The scorecard as text: one line per measure with its next action, then the escapes. */
export const scorecardText = (card: Scorecard): string => {
  const lines = [
    `verification scorecard since ${card.since}: ${String(card.merged)} merged pull requests, ${String(card.fixes)} fixes or reverts (${String(card.untraced)} untraceable)`,
    '',
    ...row('escape rate', card.escapeRate),
    ...row('receipts', card.receipts),
    ...row('recall', card.recall),
    ...row('false alarms', card.falseAlarms),
  ];
  if (card.escapes.length > 0) {
    lines.push('', 'escapes (newest first):');
    for (const escape of card.escapes.slice(0, SHOWN)) lines.push(`  #${String(escape.pr)} ${escape.date} ${escape.status.padEnd('confirmed'.length)} ${escape.how.padEnd('traced'.length)} fixed by ${escape.fixedBy.join(', ')}  ${escape.subject}`);
    if (card.escapes.length > SHOWN) lines.push(`  and ${String(card.escapes.length - SHOWN)} more (--json lists every one)`);
  }
  return lines.join('\n');
};

/** The bands a scorecard is held to: the escape rate may not rise, receipts and recall may not fall. */
export interface Ratchet {
  readonly maxEscapeRate?: number;
  readonly minReceipts?: number;
  readonly minRecall?: number;
}

/** One band: a measured value, its limit if one is set, and which side of it is out. */
interface Band {
  readonly label: string;
  readonly measure: Measure;
  readonly limit: number | undefined;
  readonly ceiling: boolean;
}

/** The sentence for a measured value outside its band, or none. */
const breach = ({ label, measure, limit, ceiling }: Band): string[] => {
  const { value } = measure;
  // Stryker disable next-line ConditionalExpression: equivalent, a number compared with no limit is neither above nor below it
  if (value === null || limit === undefined) return [];
  const out = ceiling ? value > limit : value < limit;
  const where = ceiling ? 'above' : 'below';
  return out ? [`${label} ${pct(value)} is ${where} its band ${pct(limit)}. fix: ${measure.next}`] : [];
};

/** Each band the scorecard breaks, as a sentence with its fix. */
export const breaches = (card: Scorecard, ratchet: Ratchet): string[] => [
  ...breach({ label: 'escape rate', measure: card.escapeRate, limit: ratchet.maxEscapeRate, ceiling: true }),
  ...breach({ label: 'receipts', measure: card.receipts, limit: ratchet.minReceipts, ceiling: false }),
  ...breach({ label: 'recall', measure: card.recall, limit: ratchet.minRecall, ceiling: false }),
];
