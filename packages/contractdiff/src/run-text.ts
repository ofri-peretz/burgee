/**
 * What the commands that write files print for a person: `gen`, `extract`, `migrate` and `plugin
 * new`. Each result keeps its data for `--json`, and carries these lines under burgee's text symbol,
 * so a run without `--json` reads as a list of what happened, not as the data's fields.
 */
import { type ContractFinding } from './core/model.js';
import { type Report } from './run-commit.js';
import { type Written } from './scaffold-write.js';

export const TEXT = Symbol.for('burgee.text');

/** The data, with its text beside it for burgee to print without `--json`. */
export const withText = <T extends object>(data: T, text: () => string): T & Record<symbol, unknown> => Object.assign({ ...data }, { [TEXT]: text });

/** Each finding, with what to do on the line under it. */
const findingLines = (findings: readonly (ContractFinding & { readonly target?: string })[]): string[] =>
  findings.length === 0
    ? []
    : [
        '',
        `findings: ${String(findings.length)}`,
        ...findings.flatMap((finding) => [
          `  ${[finding.target, finding.code, finding.pointer].filter((part) => part !== undefined && part !== '').join('  ')}: ${finding.message}`,
          `    fix: ${finding.fix}`,
        ]),
      ];

/** `gen` and `extract`: each file it wrote, deleted or kept, then the findings; the stale files under `--check`, the diff under `--dry-run`. */
export const reportText = (report: Report): string => {
  if (report.stale !== undefined) {
    const head = report.stale.length === 0 ? [`up to date: ${String(report.unchanged)} file(s)`] : [`stale: ${String(report.stale.length)} file(s)`, ...report.stale.map((path) => `  ${path}`), `fix: ${report.fix as string}`];
    return [...head, ...findingLines(report.findings)].join('\n');
  }
  const verb = report.diff === undefined ? '' : 'would ';
  const done = report.files.filter((file) => file.action !== 'unchanged').map((file) => `${verb}${file.action} ${file.path}`);
  const lines = done.length === 0 ? [`nothing to write: ${String(report.unchanged)} file(s) up to date`] : done;
  return [...lines, ...findingLines(report.findings), ...(report.diff === undefined || report.diff === '' ? [] : ['', report.diff.trimEnd()])].join('\n');
};

/** What `migrate` returns, as `command-migrate.ts` builds it. */
export interface MigrateReport extends Written {
  readonly changed: boolean;
  readonly read: readonly string[];
  readonly edited: readonly string[];
  readonly findings: readonly ContractFinding[];
  readonly uninstall: string;
  readonly dryRun: boolean;
}

/** `migrate`: what it read, wrote and edited, every option it could not carry, and the command that removes the incumbent. */
export const migrateText = (report: MigrateReport): string => {
  const verb = report.dryRun ? 'would ' : '';
  const lines = [
    `read: ${report.read.length === 0 ? 'nothing (no config file and no package.json)' : report.read.join(', ')}`,
    ...report.written.map((path) => `${verb}write ${path}`),
    ...report.edited.map((path) => `${verb}edit ${path}`),
    ...report.kept.map((path) => `kept ${path}: it is already there, and yours`),
    ...report.unchanged.map((path) => `unchanged ${path}`),
  ];
  return [...lines, ...findingLines(report.findings), '', `then remove it: ${report.uninstall}`].join('\n');
};

/** `plugin new`: each file it wrote or kept, and the command that runs the plugin's conformance test. */
export const scaffoldText = (written: Written, next: string): string =>
  [
    ...written.written.map((path) => `write ${path}`),
    ...written.unchanged.map((path) => `unchanged ${path}`),
    ...written.kept.map((path) => `kept ${path}: it is already there, and yours`),
    '',
    `next: ${next}`,
  ].join('\n');
