/**
 * The "done" check (spec R9): every success criterion of the intent a PR cites has a passing
 * command recorded on this branch. Pure: the caller hands it the criteria, the evidence table and
 * the branch's stamps.
 */
import { type EvidenceRow } from './intents.js';

/** One stamped command, as the store keeps it. */
export interface Stamp {
  readonly branch: string;
  readonly at: string;
  readonly command: string;
  readonly exit: number;
  readonly digest: string;
  readonly intent?: string;
  readonly criterion?: number;
}

export interface CriterionReport {
  readonly n: number;
  readonly criterion: string;
  readonly commands: readonly string[];
  readonly fix?: string;
}

/** The evidence-table row for criterion `n`: the row whose first cell starts `C<n>.`; in a table that numbers none, the `n`th row. */
const rowFor = (rows: readonly EvidenceRow[], n: number): EvidenceRow | undefined => (rows.some((row) => /^C\d+\./u.test(row.criterion)) ? rows.find((row) => row.criterion.startsWith(`C${String(n)}.`)) : rows[n - 1]);

export interface DoneInput {
  readonly slug: string;
  readonly criteria: readonly string[];
  readonly rows: readonly EvidenceRow[];
  readonly stamps: readonly Stamp[];
  readonly branch: string;
}

export const doneReport = ({ slug, criteria, rows, stamps, branch }: DoneInput): CriterionReport[] =>
  criteria.map((criterion, i) => {
    const n = i + 1;
    const commands = stamps.filter((s) => s.branch === branch && s.intent === slug && s.criterion === n && s.exit === 0).map((s) => s.command);
    if (commands.length > 0) return { n, criterion, commands };
    const command = rowFor(rows, n)?.command ?? '<the command that proves it>';
    return {
      n,
      criterion,
      commands,
      fix: `proofline stamp --intent ${slug} --criterion ${String(n)} --run "${command}" --not-checked "<what you did not check>"`,
    };
  });

/** The `Checked:` line of a done report: each criterion met and by what, then each one not. */
export const doneLine = (report: readonly CriterionReport[]): string => {
  const met = report.filter((r) => r.fix === undefined);
  const open = report.filter((r) => r.fix !== undefined);
  const metText = met.length > 0 ? met.map((r) => `C${String(r.n)} by ${r.commands.map((c) => `\`${c}\``).join(', ')}`).join('; ') : 'no criterion';
  return `Checked: ${metText}. Not checked: ${open.length > 0 ? open.map((r) => `C${String(r.n)}`).join(', ') : 'nothing'}.`;
};
