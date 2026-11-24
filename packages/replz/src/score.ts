/**
 * The report (replz spec R4): recall per stage, so a pipeline that finds a bug and then drops it in
 * verification shows where; false alarms on the controls; and for every check and checklist item, how
 * often it fired and how often that firing was right. A check or item that never fired is named: it
 * costs a reviewer's attention or a CI minute and has not earned it on these cases.
 */
import { type Case } from './cases.js';
import { type Finding, type Severity, SEVERITIES } from './config.js';

export interface Graded {
  readonly finding: Finding;
  /** The grader said it describes the answer key. Always false on a control, which has none. */
  readonly matches: boolean;
}

export interface CaseResult {
  readonly case: Case;
  readonly findings: readonly Graded[];
  /** More findings than the cap: those past it were not graded. */
  readonly capped: boolean;
  /** Each check's id, and whether it failed on this case. */
  readonly fired: Readonly<Record<string, boolean>>;
}

export interface Firing {
  readonly id: string;
  readonly kind: 'check' | 'item';
  readonly fired: number;
  /** A check firing on a bug case, or an item's finding that matched the answer. */
  readonly right: number;
}

export interface Report {
  readonly bugs: number;
  readonly controls: number;
  readonly recall: readonly { readonly stage: string; readonly found: number }[];
  /** Findings at the last stage, by severity. */
  readonly severity: Readonly<Record<Severity, number>>;
  /** Controls with a must-fix or should-fix finding at the last stage. */
  readonly falseAlarms: number;
  readonly firing: readonly Firing[];
  readonly neverFired: readonly string[];
  readonly capped: readonly string[];
}

const BLOCKING: ReadonlySet<Severity> = new Set(['must-fix', 'should-fix']);

export const score = (results: readonly CaseResult[], stages: readonly string[], checks: readonly string[], items: readonly string[]): Report => {
  const bugs = results.filter((result) => result.case.kind === 'bug');
  const controls = results.filter((result) => result.case.kind === 'control');
  const final = stages.at(-1);
  const atFinal = results.flatMap((result) => result.findings.filter((graded) => graded.finding.stage === final));
  const severity = Object.fromEntries(SEVERITIES.map((level) => [level, atFinal.filter((graded) => graded.finding.severity === level).length])) as Record<Severity, number>;
  const firing: Firing[] = [
    ...checks.map((check): Firing => {
      const firedOn = results.filter((result) => result.fired[check] === true);
      return { id: check, kind: 'check', fired: firedOn.length, right: firedOn.filter((result) => result.case.kind === 'bug').length };
    }),
    ...items.map((item): Firing => {
      const named = results.flatMap((result) => result.findings).filter((graded) => graded.finding.item === item);
      return { id: item, kind: 'item', fired: named.length, right: named.filter((graded) => graded.matches).length };
    }),
  ];
  return {
    bugs: bugs.length,
    controls: controls.length,
    recall: stages.map((stage) => ({ stage, found: bugs.filter((result) => result.findings.some((graded) => graded.matches && graded.finding.stage === stage)).length })),
    severity,
    falseAlarms: controls.filter((result) => result.findings.some((graded) => graded.finding.stage === final && BLOCKING.has(graded.finding.severity))).length,
    firing,
    neverFired: firing.filter((row) => row.fired === 0).map((row) => row.id),
    capped: results.filter((result) => result.capped).map((result) => result.case.id),
  };
};

const HUNDRED = 100;

const percent = (part: number, whole: number): string => (whole === 0 ? 'n/a' : `${String(Math.round((part / whole) * HUNDRED))}%`);

export const toText = (report: Report): string => {
  const lines = [`${String(report.bugs)} bug case(s), ${String(report.controls)} control(s)`, '', 'recall per stage:'];
  for (const { stage, found } of report.recall) lines.push(`  ${stage}: ${String(found)} of ${String(report.bugs)} (${percent(found, report.bugs)})`);
  lines.push(`false alarms on controls: ${String(report.falseAlarms)} of ${String(report.controls)} (${percent(report.falseAlarms, report.controls)})`);
  lines.push(`last-stage findings: ${SEVERITIES.map((level) => `${level} ${String(report.severity[level])}`).join(', ')}`);
  if (report.firing.length > 0) {
    lines.push('', 'firing (fired / right):');
    for (const row of report.firing) lines.push(`  ${row.kind} ${row.id}: ${String(row.fired)} / ${String(row.right)}`);
  }
  if (report.neverFired.length > 0) lines.push('', `never fired: ${report.neverFired.join(', ')}. fix: keep or drop each, in a decision`);
  if (report.capped.length > 0) lines.push('', `capped (findings past --max-findings not graded): ${report.capped.join(', ')}`);
  return lines.join('\n');
};
