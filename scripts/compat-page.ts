/**
 * Writes the family app's content/docs/compatibility.mdx (apps/docs today) from the oracle's last results. Generated,
 * never hand-edited, so the published number is the measured number (B7, C2).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and scripts read the app table through its one typed reader rather than re-parsing it
import { familyApp } from '../apps/docs-chassis/src/config';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree, and `compat.ts` is not an export
import { GRADED_VERSIONS, SUPPORTED_MAJORS } from '../packages/burgee/src/compat.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6, scripts/oracle-import-lock.test.ts)
import { HOSTS, PREVIOUS_MAJORS } from '../packages/compat-oracle/src/hosts.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const oracle = join(root, 'packages', 'compat-oracle');
/**
 * The family app's content, from `.github/vercel-apps.json`'s one `familyPages: true` row —
 * never a second app's (docs-per-package R13). One page, one host, so a published number
 * cannot disagree with itself; `scripts/vercel-apps-lock.test.ts` fails if this path leaves
 * that app.
 */
export const OUT = join(root, familyApp().dir, 'content', 'docs', 'compatibility.mdx');
const PERCENT = 100;
/** Length of an ISO date, `YYYY-MM-DD`. */
const ISO_DATE = 10;

interface Grade {
  host: string;
  target: string;
  passed: number;
  /** Cases the host's own suite marks `failing` that the target passes; counted, and said. */
  exceeded?: number;
  reference: number;
  tests: number;
  rate: number;
  note?: string;
  error?: string;
  internals?: { files: number; tests: number; passed: number };
}
interface Results {
  measured: string;
  grades: Grade[];
}

function read(file: string): Results | undefined {
  const p = join(oracle, file);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Results) : undefined;
}

const burgee = read('results.json');
const control = read('results.control.json');
const pct = (g: Grade | undefined): string => (g === undefined ? '—' : `${(g.rate * PERCENT).toFixed(1)}%`);
const cell = (g: Grade | undefined): string => {
  if (g === undefined) return '—';
  if (g.note !== undefined) return `0 / ${g.reference} (${g.note})`;
  // A pass the host's own suite calls a failure is still a pass, but it is not the same
  // kind of pass as the other fourteen, and a table that hides the difference is the kind
  // of compat number this repository exists not to publish.
  const over = g.exceeded === undefined || g.exceeded === 0 ? '' : ` (${g.exceeded} the host marks failing and we pass)`;
  return `${g.passed} / ${g.reference > 0 ? g.reference : g.tests}${over}`;
};

const internals = (g: Grade | undefined): string => (g?.internals === undefined ? '—' : `${g.internals.passed} / ${g.internals.tests}`);
/** One results row, in the eight columns both tables share — which is what `normaliseControls` reads. */
const row = (h: (typeof HOSTS)[number]): string => {
  const b = burgee?.grades.find((g) => g.host === h.name);
  const c = control?.grades.find((g) => g.host === h.name);
  return `| **${h.name}** | \`${h.target}\` | ${cell(b)} | ${pct(b)} | ${cell(c)} | ${pct(c)} | ${internals(b)} | ${internals(c)} |`;
};
const rows = HOSTS.filter((h) => h.status === 'active').map(row);
/** C1 — each older major's own suite against the same front-end, graded by `compat --majors`. */
const previousRows = PREVIOUS_MAJORS.map(row);
const others = HOSTS.filter((h) => h.status !== 'active').map((h) => `| ${h.name} | ${h.status} | ${h.note ?? ''} |`);

/**
 * Every excluded case, published by name. `compat-oracle/intent.md`: "the exclusion list is
 * explicit, named and justified in the repo — an exclusion that grows silently is how a
 * compat claim becomes a lie." Generated from `hosts.ts`, so it cannot drift from the gate.
 */
const excluded = HOSTS.filter((h) => (h.excludes ?? []).length > 0).flatMap((h) => (h.excludes ?? []).map((e) => `| **${h.name}** | \`${e.match.trim()}\` | ${e.why} |`));

/**
 * The other three ways a case leaves a number, published beside the exclusions (C4). Each is
 * declared in `hosts.ts` with a mandatory reason; until 2026-09-23 only `excludes` reached this
 * page, so a reader saw the named cases and none of the allowances behind the other rates.
 */
// The previous majors' declarations are published beside the current ones: an allowance on
// `yargs-17` subtracts from a number on this page exactly as one on `yargs` does.
const active = [...HOSTS.filter((h) => h.status === 'active'), ...PREVIOUS_MAJORS];
const allowances = active.flatMap((h) =>
  h.controlFailures === undefined ? [] : [`| **${h.name}** | ${h.controlFailures.count} | ${h.controlFailures.why} |`],
);
const platformOnly = (c: { only?: readonly string[]; notOn?: readonly string[] }): string =>
  c.only !== undefined ? `only on ${c.only.join(', ')}` : `not on ${(c.notOn ?? []).join(', ')}`;
const conditional = active.flatMap((h) =>
  h.conditionalCases === undefined ? [] : [`| **${h.name}** | ${h.conditionalCases.count} | ${platformOnly(h.conditionalCases)} | ${h.conditionalCases.why} |`],
);
const ungraded = active.flatMap((h) => (h.ungradedDirs ?? []).map((d) => `| **${h.name}** | \`${d.dir}/\` | ${d.why} |`));

/**
 * C1 — the declared range per host, from `SUPPORTED_MAJORS`, and the older majors graded for
 * it. Claimed or not is read off the declaration rather than off this run's numbers, so the
 * row says what `migrate` does and cannot vary with the machine the control ran on; the lock
 * in `scripts/supported-majors-lock.test.ts` is what keeps a declaration level.
 */
const supported = HOSTS.filter((h) => h.status === 'active').map((h) => {
  const pkg = h.npmName ?? h.name;
  const claimed = SUPPORTED_MAJORS[pkg] ?? [];
  const older = PREVIOUS_MAJORS.filter((p) => p.majorOf === h.name).map((p) => {
    const major = Number(/\d+/.exec(p.pinnedVersion ?? '')?.[0]);
    return `**${p.name}** (${p.pinnedVersion ?? '?'}) — ${claimed.includes(major) ? 'claimed' : 'graded, not claimed'}`;
  });
  return `| ${h.name} | ${claimed.map((m) => `**${m}**`).join(', ') || '—'} | ${GRADED_VERSIONS[pkg] ?? '—'} | ${older.join('; ') || '—'} |`;
});

const page = `---
title: Compatibility
description: Each host's own test suite, run against burgee in CI. A published pass rate that only goes up — never the word "compatible".
---

Generated by \`npm run compat:page\` from the oracle's last run${burgee === undefined ? '' : ` on ${burgee.measured.slice(0, ISO_DATE)}`}.
Do not edit by hand.

Each row is the **host's own test suite** — vendored, unmodified apart from the import
specifier — pointed at burgee's front-end through a generated shim. The *control* column is
the same suite pointed at the real host: it proves the gate works before it grades anything
of ours, and it is the reference total every rate is measured against. A file that fails to
import registers as one test instead of its twenty, so measuring against registered tests
would flatter a partial implementation; measuring against the control's total does not.

| Host | Front-end | burgee | rate | control | rate | internals (burgee) | internals (control) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

**Every file of every suite is vendored and run**, and every case that leaves the gate is
named below. Files that import only the host's *internal* modules (its own file layout) are
graded on the informational *internals* columns and never enter the gate: passing them would
mean copying the host, not being compatible with it. A public-surface file that also touches
an internal module stays in the gate, with that import shimmed to our main entry.
${
  excluded.length === 0
    ? ''
    : `
### Cases excluded from the gate

A case that cannot fail for any implementation measures nothing, and counting it inflates the
rate. These are excluded by name — they still run, and they still appear in the raw TAP.

| Host | Cases | Why |
| :--- | :--- | :--- |
${excluded.join('\n')}
`
}${
  allowances.length === 0
    ? ''
    : `
### Control failures allowed

The control is the real host run through our harness. Where it fails a case for a reason that
is the harness's and not the host's, the allowance is the exact count, and the gate refuses a
different one — so it can neither hide a regression nor grow quietly.

| Host | Cases | Why |
| :--- | ---: | :--- |
${allowances.join('\n')}
`
}${
  conditional.length === 0
    ? ''
    : `
### Cases only some platforms register

The reference is the full suite on every platform, so a case a platform never registers is
counted against us there rather than dropped.

| Host | Cases | Registered | Why |
| :--- | ---: | :--- | :--- |
${conditional.join('\n')}
`
}${
  ungraded.length === 0
    ? ''
    : `
### Directories vendored and not graded

Copied with the suite because its tests need them, and never run as tests themselves.

| Host | Directory | Why |
| :--- | :--- | :--- |
${ungraded.join('\n')}
`
}
## Supported majors

A major is claimed only where the host's **own suite at that major** grades the front-end
level with the host itself — every case the host passes in this harness, passed. The current
major is the release the table above grades. An older major is its own suite, vendored at that
major's last tag and graded in CI beside the current one; the claim is
\`SUPPORTED_MAJORS\` in \`burgee/src/compat.ts\`, which \`burgee migrate\` reads, and a lock holds it
to these rows (C1).

| Host | Majors claimed | Release graded | Older majors graded |
| :-- | :-- | :-- | :-- |
${supported.join('\n')}

| Host | Front-end | burgee | rate | control | rate | internals (burgee) | internals (control) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
${previousRows.join('\n')}

An older major that grades below level is published here and not claimed: a program on it is
left alone by \`burgee migrate\`, and the note in \`hosts.ts\` names the cases that differ.

A front-end does not reach 1.0 until its rate is **100%** (C7). Below that it ships pre-1.0
and is never described as compatible. The rate ratchets: a pull request that lowers it fails
CI unless it edits the baseline with a written reason (C5).

## Other hosts

| Host | Status | Why |
| :--- | :--- | :--- |
${others.join('\n')}

## Reproduce

\`\`\`bash
npm run compat -- --vendor --control   # vendor both suites, grade the real hosts
npm run compat                          # grade burgee
npm run compat -- --majors --control    # the older majors, against the real hosts (C1)
npm run compat -- --majors              # the older majors, against burgee
\`\`\`
`;

/**
 * `--check` for the same reason `bench:page` has one: this page is generated and it went
 * stale in silence. `flagstaff/cli-table3` was graded 29 / 29 and the published table went
 * on saying `flagstaff/table` 0 / 29 — the number was measured, merged, and never reached
 * the page, because nothing compared the two.
 *
 * It runs in the Ratchet job rather than on every check, because a full page needs both
 * halves: `results.json` from the target grade and `results.control.json` from the control,
 * and the control's numbers are the Linux ones (yargs scores 802 / 804 there and 804 / 804
 * elsewhere). One job that produces both is the only place the comparison means anything.
 */
/**
 * The one sentence on the page that is a property of the *run* rather than of the
 * measurement. Normalising it is the whole of the difference between a check that gates on
 * compatibility and one that goes red at midnight UTC.
 */
const MEASURED_ON = /^(Generated by `npm run compat:page` from the oracle's last run) on \d{4}-\d{2}-\d{2}\./m;

/**
 * The control columns are a property of the machine, and this check runs on exactly one.
 *
 * The header four paragraphs up already says so — *"the control's numbers are the Linux ones
 * (yargs scores 802 / 804 there and 804 / 804 elsewhere)"* — and then compared them anyway.
 * Measured 2026-09-16, regenerating on darwin: cross-spawn 67 vs 68, clack 576 vs 578,
 * exit-hook 16 vs 21, rc absent vs 1 / 1. Four rows red, none of them a statement about us,
 * and the report names only the first because the diff stops there. A contributor on a Mac
 * cannot produce the file ubuntu demands, so the check gates on the developer's OS rather
 * than on compatibility — which is the failure this file's own `--check` exists to prevent,
 * pointed the other way.
 *
 * Only the columns are normalised, never the rows: a host appearing, vanishing or changing
 * its front-end still fails, and so does every *target* number, which is what the page is
 * actually claiming. **The control is gated where it is measured** — `report.ts` refuses a
 * run whose control falls below its own reference minus its declared allowance, on whatever
 * machine that run happens on. Nothing is lost by not gating it twice, once badly.
 *
 * Columns, from the table header: 1 Host · 2 Front-end · 3 burgee · 4 rate · **5 control** ·
 * **6 rate** · 7 internals (burgee) · **8 internals (control)**.
 */
const CONTROL_COLUMNS = new Set([5, 6, 8]);

/** A results row with its control cells blanked; anything that is not a row is untouched. */
function normaliseControls(line: string): string {
  if (!line.startsWith('| ')) return line;
  const cells = line.split('|');
  // `split` gives an empty first and last element for a well-formed row; cell N is index N.
  if (cells.length !== 10) return line;
  return cells.map((cell, i) => (CONTROL_COLUMNS.has(i) ? ' … ' : cell)).join('|');
}

/** The first line where the two pages disagree about something measured. */
export function drift(committed: string, generated: string): { line: number; committed: string; generated: string } | undefined {
  const strip = (s: string): string[] => s.replace(MEASURED_ON, '$1.').split('\n').map(normaliseControls);
  const a = strip(committed);
  const b = strip(generated);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return { line: i + 1, committed: a[i] ?? '(end of file)', generated: b[i] ?? '(end of file)' };
  }
  return undefined;
}

function check(): void {
  if (!existsSync(OUT)) {
    process.stderr.write(`✖ ${OUT} does not exist. Run \`npm run compat:page\`.\n`);
    process.exitCode = 1;
    return;
  }
  const found = drift(readFileSync(OUT, 'utf8'), page);
  if (!found) {
    process.stdout.write(`✓ ${OUT} matches the measured results\n`);
    return;
  }
  process.stderr.write(
    `✖ ${OUT} is not what \`npm run compat:page\` produces from the oracle's results.\n` +
      `  line ${found.line}\n` +
      `    committed: ${found.committed}\n` +
      `    measured:  ${found.generated}\n` +
      `  Run the oracle and \`npm run compat:page\`, and commit the result — the page says it is generated, and this is what makes that true.\n`,
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) check();
  else {
    writeFileSync(OUT, page);
    process.stdout.write(`wrote ${OUT}\n`);
  }
}
