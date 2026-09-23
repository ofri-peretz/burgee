/**
 * `npm run compat` — vendor, grade, print, ratchet.
 *
 * Exits non-zero when any active host's pass count falls below its recorded
 * baseline (C5), so the number can only go up without a deliberate edit.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { active, type Host, HOSTS } from './hosts.js';
import { type Baseline, controlName, type Grade, grade, readBaseline, regressed } from './run.js';
import { diffRecords, isEmptyDiff, latestVersion, readRecord, renderDiff } from './upstream.js';
import { vendor } from './vendor.js';
import { check as checkCompetitors, fingerprint as writeFingerprints } from './watch.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR_DIR = resolve(root, 'vendor');
const BASELINE = resolve(root, 'baseline');
const RESULTS = resolve(root, 'results.json');
const CONTROL_RESULTS = resolve(root, 'results.control.json');
const VENDOR_DIFF = resolve(root, 'vendor-diff.md');
const UPSTREAM = resolve(root, 'upstream.json');
const COMPETITORS = resolve(root, 'competitors-upstream.json');
const PACKAGES_DIR = resolve(root, '..');
const REPO_ROOT = resolve(root, '..', '..');

const PERCENT = 100;
const BAR_WIDTH = 24;
const SHORT_SHA = 8;
const HOST_COL = 12;
const COUNT_COL = 5;
const PCT_COL = 6;

/** Which way the count moved against the baseline, or nothing if there is none yet. */
function arrow(g: Grade, was: Baseline[string] | undefined): string {
  if (was === undefined) return '';
  const glyph = g.passed >= was.passed ? '\u25B2' : '\u25BC';
  return ` ${glyph} ${g.passed - was.passed}`;
}

function bar(rate: number): string {
  const full = Math.round(rate * BAR_WIDTH);
  return '█'.repeat(full) + '░'.repeat(BAR_WIDTH - full);
}

function line(g: Grade, baseline: Baseline): string {
  if (g.error !== undefined) return `  ${g.host.padEnd(HOST_COL)} ${g.error}`;
  if (g.note !== undefined) {
    const total = g.reference > 0 ? g.reference : g.tests;
    const zero = `${String(0).padStart(COUNT_COL)} / ${String(total).padEnd(COUNT_COL)}`;
    return `  ${g.host.padEnd(HOST_COL)} ${bar(0)} ${zero}   0.0%  ${g.note}`;
  }
  const pct = `${(g.rate * PERCENT).toFixed(1)}%`.padStart(PCT_COL);
  const total = g.reference > 0 ? g.reference : g.tests;
  const counts = `${String(g.passed).padStart(COUNT_COL)} / ${String(total).padEnd(COUNT_COL)}`;
  const skipped = g.skipped > 0 ? `   (${g.skipped} skipped on this OS)` : '';
  // A case the incumbent marks `failing` and we pass is counted as a pass. That is a
  // judgement, not arithmetic, so it is printed every time it is made — a reclassification
  // nobody sees is indistinguishable from a grader marking its own homework.
  const over = g.exceeded === undefined || g.exceeded === 0 ? '' : `   (${g.exceeded} the host marks failing and we pass)`;
  // Printed for the same reason as the two above: the denominator here is the full suite and
  // this machine did not run all of it, which a reader comparing two terminals has to be told
  // rather than left to derive. It is why the rate is the same number on both.
  const absent = absentHere(g.host) === 0 ? '' : `   (${absentHere(g.host)} the suite does not register on ${process.platform}, counted against us)`;
  return `  ${g.host.padEnd(HOST_COL)} ${bar(g.rate)} ${counts} ${pct}${arrow(g, baseline[g.host])}${skipped}${over}${absent}`;
}

export type Write = (s: string) => void;

/** A host's public line, plus its informational internals line when it has one. */
function gradeLines(g: Grade, baseline: Baseline): string {
  const i = g.internals;
  const internals =
    i === undefined
      ? ''
      : `  ${''.padEnd(HOST_COL)} internals ${String(i.passed).padStart(COUNT_COL)} / ${String(i.tests).padEnd(COUNT_COL)} — ${i.files} file(s) testing the host's own file layout; informational, never the gate\n`;
  return `${line(g, baseline)}\n${internals}`;
}

interface Update {
  host: string;
  from: string;
  to: string;
  report: string;
}

/**
 * `--upstream`: for each host, is there a newer npm release than the one vendored? If so,
 * fingerprint it in a scratch clone and diff it against the committed record. Nothing
 * under vendor/ changes; the result is `upstream.json`, which the daily workflow turns
 * into an issue carrying the exact list of new and changed tests and surface names.
 */
function checkUpstream(host: Host, write: Write): Update | undefined {
  const record = readRecord(join(VENDOR_DIR, host.name));
  if (record === undefined) {
    write(`  ${host.name.padEnd(HOST_COL)} not vendored\n`);
    return undefined;
  }
  const latest = latestVersion(host.npmName ?? host.name);
  if (latest === record.version) {
    write(`  ${host.name.padEnd(HOST_COL)} ${record.version} — up to date\n`);
    return undefined;
  }
  const scratch = mkdtempSync(join(tmpdir(), `upstream-${host.name}-`));
  try {
    const fresh = vendor(host, scratch, latest);
    const diff = diffRecords(record, fresh.record);
    const summary = isEmptyDiff(diff)
      ? 'no test or surface changes'
      : `+${diff.tests.added.length}/-${diff.tests.removed.length} tests, +${diff.surface.added.length}/-${diff.surface.removed.length} surface names, ${diff.files.changed.length} file(s) changed`;
    write(`  ${host.name.padEnd(HOST_COL)} ${record.version} → ${latest}: ${summary}\n`);
    return { host: host.name, from: record.version, to: latest, report: renderDiff(host.name, record, fresh.record, diff) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function upstreamMode(write: Write): number {
  write('\nupstream releases\n\n');
  const updates = active()
    .map((host) => checkUpstream(host, write))
    .filter((u): u is Update => u !== undefined);
  writeFileSync(UPSTREAM, `${JSON.stringify({ checked: new Date().toISOString(), updates }, null, 2)}\n`);
  write(updates.length === 0 ? '\n  every host is at its latest release\n' : `\n  ${updates.length} host(s) have a newer release — see upstream.json\n`);
  return 0;
}

/** Re-vendor each host at its latest release, reporting what moved since the last record. */
function vendorAll(hosts: Host[], write: Write): void {
  mkdirSync(VENDOR_DIR, { recursive: true });
  const diffs: string[] = [];
  for (const host of hosts) {
    const result = vendor(host, VENDOR_DIR);
    write(
      `vendored ${result.host} ${result.version} (${result.tag ?? 'untagged'} @ ${result.commit.slice(0, SHORT_SHA)}) — ${result.files} files (${result.internalFiles.length} internal-only), ${result.internals.length} internal module(s) shimmed\n`,
    );
    if (result.previous !== undefined && result.diff !== undefined && !isEmptyDiff(result.diff)) {
      write(`  moved from ${result.previous.version}: +${result.diff.tests.added.length}/-${result.diff.tests.removed.length} tests, +${result.diff.surface.added.length}/-${result.diff.surface.removed.length} surface names\n`);
      diffs.push(renderDiff(result.host, result.previous, result.record, result.diff));
    }
  }
  if (diffs.length > 0) writeFileSync(VENDOR_DIFF, `${diffs.join('\n')}\n`);
  else rmSync(VENDOR_DIFF, { force: true });
}

/** What a host is allowed to fail against its own package, and nothing more. */
const allowedFailures = (host: string): number => HOSTS.find((h) => h.name === host)?.controlFailures?.count ?? 0;

/**
 * Cases *this* machine's copy of the suite does not contain, because the suite guards them
 * with the platform — `0` on the platforms that hold the full set, and on every host that
 * declares nothing.
 *
 * Read off the declaration and never inferred. A case inside
 * `if (process.platform === 'linux') { … }` is not handed to the runner at all, so it emits
 * no `# SKIP` and no line of any kind: there is nothing here for a heuristic to notice, which
 * is why `cosmiconfig`'s 241-on-darwin against 243-on-ubuntu reached a published page as two
 * different rates for one commit.
 */
export function absentHere(host: string, platform: NodeJS.Platform = process.platform): number {
  const declared = HOSTS.find((h) => h.name === host)?.conditionalCases;
  if (declared === undefined) return 0;
  const absent = declared.only === undefined ? (declared.notOn ?? []).includes(platform) : !declared.only.includes(platform);
  return absent ? declared.count : 0;
}

/**
 * The passes this machine cannot see: a host's declared `passing`, on a platform where
 * {@link absentHere} says its conditional cases never register, and `0` everywhere else.
 */
export function absentPassing(host: string, platform: NodeJS.Platform = process.platform): number {
  if (absentHere(host, platform) === 0) return 0;
  return HOSTS.find((h) => h.name === host)?.conditionalCases?.passing ?? 0;
}

/** Did this row fall — a control short of its reference, or a target below its baseline? */
function fellFor(control: boolean, baseline: Baseline): (g: Grade) => boolean {
  return (g) => g.error !== undefined || (control ? controlShortfall(g) !== undefined : regressed(g, baseline, absentPassing(g.host)));
}

/** How many more times a row that fell is graded before its red is believed (R7). */
export const REPEATS = 2;

/**
 * R7 — repeat and agree. A row that fell is graded again, up to {@link REPEATS} more times, and
 * is red only if every attempt agrees it fell. Under machine load three rows have moved with
 * nothing in them changing — `exit-hook` on a fixed 1000 ms kill, `cross-spawn`'s shebang
 * timeout, `ansi-escapes` — and a gate that is red on a busy runner and green on an idle one
 * is measuring the runner.
 *
 * It cannot hide a regression: a real one fails every attempt, and only rows that fell are
 * re-run, so a green run costs nothing. A row that recovers is **named**, with each attempt's
 * count, on the run's own output and on the grade (`attempts`), so a flake is a fact a reader
 * can see and count rather than a red that went away.
 */
/** What `repeatAndAgree` needs besides the grades: when a row fell, how to grade it again, where to say so. */
export interface Agreement {
  fell: (g: Grade) => boolean;
  regrade: (g: Grade) => Grade;
  write: Write;
  repeats?: number;
}

export function repeatAndAgree(grades: Grade[], { fell, regrade, write, repeats = REPEATS }: Agreement): Grade[] {
  return grades.map((first) => {
    if (!fell(first)) return first;
    const attempts = [first.passed];
    let last = first;
    for (let i = 0; i < repeats && fell(last); i += 1) {
      last = regrade(first);
      attempts.push(last.passed);
    }
    if (!fell(last)) write(`\n⚠ ${first.host}: fell on attempt 1 and recovered on attempt ${String(attempts.length)} (${attempts.join(' → ')} passing) — load, not a regression; the flake is recorded, not hidden\n`);
    return { ...last, attempts };
  });
}

/**
 * The control proves the gate (`compat-oracle/intent.md`, criterion 3), so the bar is that
 * the host's own suite *passes* against the host's own package — not merely that something
 * registered. `passed === 0` was the whole test until 2026-09-09, and it let a control at
 * **15 / 16, 93.8%** exit 0: a vendored suite required a package the oracle does not
 * install, one file failed to load, and the gate said nothing. A known-good implementation
 * below its own reference is now red.
 *
 * The allowance is per host, declared in `hosts.ts` with its reason, because real yargs
 * legitimately fails 2 of its own 804 from inside a vendored copy.
 */
function controlFell(grades: Grade[]): Grade[] {
  return grades.filter((g) => g.error === undefined && controlShortfall(g) !== undefined);
}

/**
 * Why a control run is red, or nothing.
 *
 * Failing a case and never running it are the same hole seen from two sides, and it was
 * the second side that shipped here: four files under `test/issues/` were vendored,
 * committed, and graded by nobody, because the walk that found them was not recursive.
 * Every count stayed green — a case that never registers fails nothing. So a control that
 * registers fewer cases than the reference it set is as red as one that fails them.
 */
function controlShortfall(g: Grade): string | undefined {
  if (g.passed === 0) return 'nothing passed against its own package';
  if (g.failed > allowedFailures(g.host)) return `${String(g.failed)} failing against its own package (${String(allowedFailures(g.host))} allowed)`;
  // `+ skipped`, because a case that registered and skipped itself is accounted for and a
  // case that never registered is not. Both commander and yargs skip one OS-specific test
  // on Linux and none on the machine that set the reference; without this the control is
  // red on ubuntu for doing exactly what it should.
  //
  // `+ absentHere`, for the case that does not even get that far. A skip is a case the
  // runner was given and declined; a case the suite guards with `process.platform` is one
  // the runner never saw, and the reference is deliberately the full set so the published
  // denominator is the same on every machine. That shortfall is declared per host with its
  // reason, exact rather than a ceiling, and spent only off the platforms that lack the
  // cases — so a control that loses a case for any *other* reason is as red as it was.
  const registered = g.tests + g.skipped + absentHere(g.host);
  if (g.reference > 0 && registered < g.reference) return `${String(registered)} of its own ${String(g.reference)} cases registered — the rest stopped running`;
  // And the other direction, which was silent until 2026-09-16 and is the half that shipped.
  //
  // `rate()` divides by `max(reference, tests)` and its comment calls a larger count "the
  // honest denominator until the baseline is re-measured" — true of a rate in isolation, and
  // not true of a rate that is *published*. A control that counts more cases than the
  // reference is proof the reference is not this suite, and the published denominator then
  // depends on which machine last regenerated the page: `cosmiconfig` committed 186 / 241 at
  // 77.2% from darwin and measured 76.5% on ubuntu, where the same suite is 243 cases. The
  // control is the run that fixes the reference, so this is the run that has to refuse it —
  // re-record the reference, or declare the difference in `conditionalCases`.
  //
  // Read off `tests` and NOT off `registered`, which is the distinction the first draft of
  // this check got wrong and commander and yargs caught within one run. `registered` adds the
  // skips back so the clause above cannot punish a machine for skipping more; the denominator
  // is `max(reference, tests)` and skips are already out of `tests`, so adding them here made
  // every host with a single OS-specific skip read one case over its own reference.
  if (g.reference > 0 && g.tests > g.reference) {
    return `${String(g.tests)} cases counted against a recorded reference of ${String(g.reference)} — the reference is not this suite, so the published denominator reads the machine`;
  }
  return undefined;
}

/**
 * Rows that were graded as one pass/fail bit without saying so in their baseline.
 *
 * `mode: "exit-code"` is the honest grade for a suite with no reporter — rc prints its
 * config objects with `console.log` and nothing else — and it is also the most flattering
 * failure this oracle has: a row that stops counting cases and starts counting *the run*
 * reports `1 / 1, 100.0%` while measuring almost nothing. Every other collapse here is
 * loud (a file that fails to import registers one test instead of twenty and the reference
 * catches it); this one would be silent, because the coarse row is *correct* for the host
 * that declared it.
 *
 * So the declaration is the control. A host's baseline fragment says `mode: "exit-code"`
 * or its row may not be graded that way, and switching a row over is then a visible edit
 * to a committed file rather than a line in `hosts.ts` nobody re-reads.
 */
export function silentDowngrades(grades: Grade[], baseline: Baseline): string[] {
  return grades
    .filter((g) => g.mode === 'exit-code' && baseline[g.host] !== undefined && baseline[g.host]?.mode !== 'exit-code')
    .map((g) => `${g.host}: graded by exit code (1 case for the whole suite), but baseline/${g.host}.json does not declare \`"mode": "exit-code"\``);
}

export function verdict(grades: Grade[], baseline: Baseline, write: Write, control = false): number {
  const broken = grades.filter((g) => g.error !== undefined);
  const fell = control ? controlFell(grades) : grades.filter((g) => regressed(g, baseline, absentPassing(g.host)));
  for (const g of fell) {
    if (control) write(`\n✖ ${g.host}: ${controlShortfall(g) ?? ''} — the control proves the gate, so it has to pass\n`);
    else write(`\n✖ ${g.host}: ${g.passed} passing, baseline was ${baseline[g.host]?.passed ?? 0}\n`);
  }
  // Checked on the control run as well as the ratchet: the control is where a reference is
  // set, and a reference of 1 is exactly what a silent downgrade would leave behind.
  const downgraded = silentDowngrades(grades, baseline);
  for (const why of downgraded) write(`\n✖ ${why} — a row that stops counting cases stops measuring anything\n`);
  if (broken.length > 0) write(`\n✖ ${broken.length} host(s) could not be graded\n`);
  return fell.length + broken.length + downgraded.length > 0 ? 1 : 0;
}

interface Results {
  measured: string;
  grades: Grade[];
}

/**
 * The results file carries one grade per active host. A run over a subset (`compat chalk`)
 * replaces its hosts' rows and keeps the rest, so the page generated from the file never
 * loses a host because another was re-measured alone.
 */
/**
 * `planned` is written alongside the grades because a reader of this file cannot otherwise
 * tell "the oracle does not grade this host yet" from "the oracle was supposed to grade
 * this host and something broke". Both look like a missing entry in `grades`, and the
 * difference is the whole judgement: the first is a declared gap, the second is a hole.
 *
 * It cost the compat axis every row to learn that. `baseline/cosmiconfig.json` and
 * `baseline/dotenv.json` record measurements taken against hosts whose `status` is still
 * `planned` (their notes say why they are not published), and `benchmarks/bands.ts` derives
 * its host list from that directory. So the axis demanded a grade for a host the oracle
 * never intended to produce one for, returned a reason, and every compat band and claim
 * read `? unmeasured` on every CI run — measured 2026-09-16 on PR #335's bench job.
 */
function writeResults(path: string, graded: Grade[]): void {
  const previous: Grade[] = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Results).grades : [];
  const names = new Set(graded.map((g) => g.host));
  const grades = [...previous.filter((g) => !names.has(g.host)), ...graded];
  const order = new Map(active().map((h, i) => [h.name, i]));
  grades.sort((a, b) => (order.get(a.host) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.host) ?? Number.MAX_SAFE_INTEGER));
  const planned = HOSTS.filter((h) => h.status === 'planned').map((h) => h.name);
  writeFileSync(path, `${JSON.stringify({ measured: new Date().toISOString(), planned, grades }, null, 2)}\n`);
}


/**
 * `--competitors`: the widened watch (upstream-watch R4). Every competitor any package
 * declares — not only the hosts with a vendored suite — fingerprinted from its published
 * tarball and diffed against the record held in `competitors.json`. Read-only: the result
 * is `competitors-upstream.json`, which the daily workflow turns into one issue per
 * (competitor, version), each carrying the proposed changeset.
 */
async function competitorMode(write: Write): Promise<number> {
  write('\ncompetitor releases\n\n');
  const result = await checkCompetitors(PACKAGES_DIR, REPO_ROOT, write);
  writeFileSync(COMPETITORS, `${JSON.stringify({ checked: new Date().toISOString(), updates: result.updates }, null, 2)}\n`);
  if (result.unfingerprinted.length > 0) {
    write(`\n  ${result.unfingerprinted.length} competitor(s) hold no fingerprint yet: ${result.unfingerprinted.join(', ')}\n`);
  }
  write(result.updates.length === 0 ? '\n  every competitor is at its recorded release\n' : `\n  ${result.updates.length} competitor(s) moved — see competitors-upstream.json\n`);
  // A competitor we could not fetch is a hole in the watch, not a clean run: exit non-zero
  // so a rename or an unpublish is a red job rather than a quietly shorter report.
  if (result.errors.length > 0) {
    write(`\n\u2716 ${result.errors.length} competitor(s) could not be fingerprinted\n`);
    return 1;
  }
  return 0;
}

/** `--fingerprint`: record every competitor's current release into `competitors.json`. */
async function fingerprintMode(write: Write): Promise<number> {
  write('\nfingerprinting competitors\n\n');
  const failures = await writeFingerprints(PACKAGES_DIR, write);
  write(failures === 0 ? '\n  every competitor fingerprinted\n' : `\n\u2716 ${failures} competitor(s) failed\n`);
  return failures === 0 ? 0 : 1;
}

export async function main(argv: string[], write: Write): Promise<number> {
  if (argv.includes('--upstream')) return upstreamMode(write);
  if (argv.includes('--competitors')) return competitorMode(write);
  if (argv.includes('--fingerprint')) return fingerprintMode(write);

  const wantsVendor = argv.includes('--vendor');
  // --control grades each host against its own real package: the proof that the gate
  // works before it grades anything of ours (rule 4). --target= overrides all hosts.
  const control = argv.includes('--control');
  const target = (argv.find((a) => a.startsWith('--target='))?.split('=')[1] ?? '').trim();
  const targetFor = (host: Host): string => {
    // The incumbent's *npm* name, which is the host's key for all but the scoped ones —
    // `clack` names no package and `@clack/prompts` names no directory.
    if (control) return controlName(host);
    return target === '' ? host.target : target;
  };
  // Hosts named bare on the command line (`compat chalk --control`) select a subset;
  // none named means every active host, which is what CI runs.
  const named = argv.filter((a) => !a.startsWith('--'));
  const unknown = named.filter((n) => !active().some((h) => h.name === n));
  if (unknown.length > 0) {
    write(`\n✖ not an active host: ${unknown.join(', ')}\n`);
    return 1;
  }
  const hosts = named.length === 0 ? active() : active().filter((h) => named.includes(h.name));

  if (wantsVendor) vendorAll(hosts, write);

  const baseline = readBaseline(BASELINE);
  const gradeOf = (host: Host): Grade => grade(host, VENDOR_DIR, targetFor(host), baseline[host.name]?.reference ?? 0);
  const grades = repeatAndAgree(hosts.map(gradeOf), { fell: fellFor(control, baseline), regrade: (g) => gradeOf(hosts.find((h) => h.name === g.host) as Host), write });

  write(control ? '\ncontrol — each host graded against its real package\n\n' : '\ncompatibility\n\n');
  for (const g of grades) write(gradeLines(g, baseline));

  const planned = HOSTS.filter((h) => h.status === 'planned').map((h) => h.name);
  if (planned.length > 0) write(`\n  planned: ${planned.join(', ')}\n`);

  writeResults(control ? CONTROL_RESULTS : RESULTS, grades);
  return verdict(grades, baseline, write, control);
}
