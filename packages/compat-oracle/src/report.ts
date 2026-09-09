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
import { type Baseline, type Grade, grade, readBaseline, regressed } from './run.js';
import { diffRecords, isEmptyDiff, latestVersion, readRecord, renderDiff } from './upstream.js';
import { vendor } from './vendor.js';
import { check as checkCompetitors, fingerprint as writeFingerprints } from './watch.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR_DIR = resolve(root, 'vendor');
const BASELINE = resolve(root, 'baseline.json');
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
  return `  ${g.host.padEnd(HOST_COL)} ${bar(g.rate)} ${counts} ${pct}${arrow(g, baseline[g.host])}${skipped}`;
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
  const latest = latestVersion(host.name);
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
  const registered = g.tests + g.skipped;
  if (g.reference > 0 && registered < g.reference) return `${String(registered)} of its own ${String(g.reference)} cases registered — the rest stopped running`;
  return undefined;
}

export function verdict(grades: Grade[], baseline: Baseline, write: Write, control = false): number {
  const broken = grades.filter((g) => g.error !== undefined);
  const fell = control ? controlFell(grades) : grades.filter((g) => regressed(g, baseline));
  for (const g of fell) {
    if (control) write(`\n✖ ${g.host}: ${controlShortfall(g) ?? ''} — the control proves the gate, so it has to pass\n`);
    else write(`\n✖ ${g.host}: ${g.passed} passing, baseline was ${baseline[g.host]?.passed ?? 0}\n`);
  }
  if (broken.length > 0) write(`\n✖ ${broken.length} host(s) could not be graded\n`);
  return fell.length + broken.length > 0 ? 1 : 0;
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
function writeResults(path: string, graded: Grade[]): void {
  const previous: Grade[] = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Results).grades : [];
  const names = new Set(graded.map((g) => g.host));
  const grades = [...previous.filter((g) => !names.has(g.host)), ...graded];
  const order = new Map(active().map((h, i) => [h.name, i]));
  grades.sort((a, b) => (order.get(a.host) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.host) ?? Number.MAX_SAFE_INTEGER));
  writeFileSync(path, `${JSON.stringify({ measured: new Date().toISOString(), grades }, null, 2)}\n`);
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
  const targetFor = (host: { name: string; target: string }): string => {
    if (control) return host.name;
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
  const grades = hosts.map((host) => grade(host, VENDOR_DIR, targetFor(host), baseline[host.name]?.reference ?? 0));

  write(control ? '\ncontrol — each host graded against its real package\n\n' : '\ncompatibility\n\n');
  for (const g of grades) write(gradeLines(g, baseline));

  const planned = HOSTS.filter((h) => h.status === 'planned').map((h) => h.name);
  if (planned.length > 0) write(`\n  planned: ${planned.join(', ')}\n`);

  writeResults(control ? CONTROL_RESULTS : RESULTS, grades);
  return verdict(grades, baseline, write, control);
}
