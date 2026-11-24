/**
 * The receipt (spec R4): what ran, with its exit code and an output digest; what was looked at in
 * the running app, by path; and what was not checked. One shape, rendered twice: as commit
 * trailers, which `git log --format='%(trailers:key=Verified-by)'` queries, and as the PR's
 * "How this was checked" block, whose first line is the `Checked:` line.
 */
import { createHash } from 'node:crypto';

export interface Check {
  readonly command: string;
  readonly exit: number;
  readonly digest: string;
}

export interface Receipt {
  readonly checks: readonly Check[];
  readonly captures: readonly string[];
  readonly notChecked: readonly string[];
  /** Set only on `Verified-by: none (<reason>)`. */
  readonly none?: string;
}

/** The first 12 hex of the output's sha256: enough to tell two runs apart, short enough for a trailer. */
const DIGEST_HEX = 12;
export const digest = (output: string): string => `sha256:${createHash('sha256').update(output).digest('hex').slice(0, DIGEST_HEX)}`;

/** One line, so a newline in a command or a reason cannot end a trailer early. */
const oneLine = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/** The commit trailers: one `Verified-by:` per check (or one `none`), one `Captured:` per path, one `Not-checked:` per gap. */
export const trailers = (receipt: Receipt): string[] => [
  ...(receipt.none === undefined ? receipt.checks.map((c) => `Verified-by: ${oneLine(c.command)} -> exit ${String(c.exit)} (${c.digest})`) : [`Verified-by: none (${oneLine(receipt.none)})`]),
  ...receipt.captures.map((path) => `Captured: ${oneLine(path)}`),
  ...receipt.notChecked.map((gap) => `Not-checked: ${oneLine(gap)}`),
];

/** The PR's `Checked:` line: each command and how it ended, then what was not checked. */
export const checkedLine = (receipt: Receipt): string => {
  const ran = receipt.none === undefined ? receipt.checks.map((c) => `\`${oneLine(c.command)}\` (${c.exit === 0 ? 'pass' : `exit ${String(c.exit)}`})`).join(', ') : `nothing (${oneLine(receipt.none)})`;
  const looked = receipt.captures.length > 0 ? `; looked at ${receipt.captures.map((p) => `\`${oneLine(p)}\``).join(', ')}` : '';
  return `Checked: ${ran}${looked}. Not checked: ${receipt.notChecked.length > 0 ? receipt.notChecked.map(oneLine).join('; ') : 'nothing'}.`;
};

/** The "How this was checked" block for a PR body: the `Checked:` line, then the trailers, which the gate reads. */
export const prBlock = (receipt: Receipt): string => ['## How this was checked', '', checkedLine(receipt), '', ...trailers(receipt)].join('\n');

export interface Verdict {
  readonly ok: boolean;
  readonly reason: string;
  readonly fix?: string;
}

const FIX = 'run `provedone stamp --run "<the command that proves it>" --not-checked "<what you did not check>"` and paste its lines, or add `Verified-by: none (<why it needs no check>)`';

/**
 * Whether a commit message or PR body carries a receipt (spec R5): a `Verified-by:` line with a
 * command, or `Verified-by: none (<reason>)` with a reason. `#` lines are a commit template's
 * comments and are not read; a merge commit carries its parents' receipts and passes.
 */
export const verdict = (message: string): Verdict => {
  const lines = message.split('\n').filter((line) => !line.startsWith('#'));
  if (/^Merge /u.test(lines.join('\n'))) return { ok: true, reason: 'merge commit' };
  const values = lines.flatMap((line) => /^Verified-by:(.*)/iu.exec(line)?.slice(1) ?? []).map((v) => v.trim());
  if (values.length === 0) return { ok: false, reason: 'no Verified-by: line', fix: FIX };
  const bareNone = values.find((v) => /^none\b/iu.test(v) && !/^none \(\s*\S[^)]*\)$/iu.test(v));
  if (bareNone !== undefined)
    return {
      ok: false,
      reason: `"Verified-by: ${bareNone}" gives no reason`,
      fix: 'write it as `Verified-by: none (<why it needs no check>)`',
    };
  if (values.some((v) => v === '')) return { ok: false, reason: 'an empty Verified-by: line', fix: FIX };
  return {
    ok: true,
    reason: values.every((v) => /^none\b/iu.test(v)) ? 'unverified, with a reason' : 'receipt',
  };
};
