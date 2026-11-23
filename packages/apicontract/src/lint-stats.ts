/**
 * `lint --stats <file>` and `--idle <days>` (apicontract-lint spec.md R13): retire idle rules. A
 * JSON file, meant for a CI cache and read by nothing else, keeps each rule's counts across runs:
 * how many runs it was in, how many findings it made, and when it last found something. `--idle 90d`
 * lists the rules that ran and found nothing in 90 days as `rule-idle` (info).
 *
 * A run counts once per commit: the file remembers the commit it last counted, so CI re-running a
 * job on the same commit changes nothing, and `lint` stays idempotent.
 */
import { type LintResult } from './lint-engine.js';
import { WARN_FOR } from './lint-history.js';
import { UsageError } from './run-config.js';

/** One rule's counts, its dates as ISO strings. */
export interface RuleStats {
  /** The first run it was in: the date an idle rule is counted from when it never found anything. */
  readonly firstRun: string;
  readonly runs: number;
  readonly findings: number;
  readonly lastFinding?: string;
}

export interface Stats {
  readonly version: 1;
  /** The commit (or, outside a repository, the day) of the last run counted. */
  readonly lastRun?: string;
  readonly rules: Readonly<Record<string, RuleStats>>;
}

/** A rule that ran and found nothing for longer than `--idle`. */
export interface Idle {
  readonly id: string;
  readonly runs: number;
  /** Its last finding's date, or its first run's when it never found anything. */
  readonly since: string;
  readonly found: boolean;
}

const EMPTY: Stats = { version: 1, rules: {} };
const DAY = 86_400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isCount = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0;
const isDate = (value: unknown): boolean => typeof value === 'string' && !Number.isNaN(Date.parse(value));

const isRuleStats = (value: unknown): boolean =>
  isRecord(value) && isDate(value.firstRun) && isCount(value.runs) && isCount(value.findings) && (value.lastFinding === undefined || isDate(value.lastFinding));

/** Whether a value is a stats file this wrote: version 1, a string `lastRun` if any, and every rule's counts. */
function isStats(value: unknown): value is Stats {
  return isRecord(value) && value.version === 1 && (value.lastRun === undefined || typeof value.lastRun === 'string') && isRecord(value.rules) && Object.values(value.rules).every((entry) => isRuleStats(entry));
}

/** JSON's value, or `undefined` for text that is not JSON. */
const parsed = (text: string): unknown => {
  // Stryker disable next-line BlockStatement: equivalent, an empty handler returns the same undefined
  try { return JSON.parse(text) as unknown; } catch { return undefined; }
};

/** The file's text as stats: none yet when there is no file; anything else this did not write is a file to delete. */
export const statsOf = (text: string | undefined, file: string): Stats => {
  if (text === undefined) return EMPTY;
  const value = parsed(text);
  if (isStats(value)) return value;
  throw new UsageError(`\`--stats ${file}\` is not a stats file lint wrote. fix: delete it, or name another file; the next run starts it again`);
};

/** The stats with one run counted: every rule that ran, its findings, and today's date where it found something. */
export const countRun = (stats: Stats, result: Pick<LintResult, 'counts' | 'findings'>, run: { readonly key: string; readonly now: Date }): Stats => {
  if (stats.lastRun === run.key) return stats;
  const today = run.now.toISOString();
  const rules = new Map(Object.entries(stats.rules));
  for (const id of Object.keys(result.counts)) {
    const found = result.findings.filter((finding) => finding.rule === id).length;
    const was = rules.get(id) ?? { firstRun: today, runs: 0, findings: 0 };
    rules.set(id, { ...was, runs: was.runs + 1, findings: was.findings + found, ...(found > 0 ? { lastFinding: today } : {}) });
  }
  return { version: 1, lastRun: run.key, rules: Object.fromEntries([...rules].sort(([a], [b]) => a.localeCompare(b, 'en'))) };
};

/** `--idle`'s days, `"90d"`; anything else is a command line to fix. */
export const idleDays = (idle: string): number => {
  const days = WARN_FOR.exec(idle)?.[1];
  if (days === undefined) throw new UsageError(`\`--idle ${idle}\` is not a number of days. fix: write \`--idle 90d\``);
  return Number(days);
};

/** The rules that ran this time and found nothing since the cutoff, in id order. */
export const idleOf = (stats: Stats, ran: readonly string[], cutoff: Date): Idle[] => {
  const rules = new Map(Object.entries(stats.rules));
  return [...ran].sort().flatMap((id) => {
    const entry = rules.get(id);
    // A rule this commit's counted run did not have (another --ruleset on the same commit) has no counts yet.
    if (entry === undefined) return [];
    const since = entry.lastFinding ?? entry.firstRun;
    return Date.parse(since) <= cutoff.getTime() ? [{ id, runs: entry.runs, since, found: entry.lastFinding !== undefined }] : [];
  });
};

/** The moment a rule must have found something since not to be idle. */
export const idleCutoff = (days: number, now: Date): Date => new Date(now.getTime() - days * DAY);
