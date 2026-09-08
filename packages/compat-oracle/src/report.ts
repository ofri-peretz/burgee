/**
 * `npm run compat` — vendor, grade, print, ratchet.
 *
 * Exits non-zero when any active host's pass count falls below its recorded
 * baseline (C5), so the number can only go up without a deliberate edit.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { active, type Host, HOSTS } from './hosts.js';
import { type Baseline, type Grade, grade, readBaseline, regressed } from './run.js';
import { diffRecords, isEmptyDiff, latestVersion, readRecord, renderDiff } from './upstream.js';
import { vendor } from './vendor.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR_DIR = resolve(root, 'vendor');
const BASELINE = resolve(root, 'baseline.json');
const RESULTS = resolve(root, 'results.json');
const CONTROL_RESULTS = resolve(root, 'results.control.json');
const VENDOR_DIFF = resolve(root, 'vendor-diff.md');
const UPSTREAM = resolve(root, 'upstream.json');

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

/** Re-vendor every active host at its latest release, reporting what moved since the last record. */
function vendorAll(write: Write): void {
  mkdirSync(VENDOR_DIR, { recursive: true });
  const diffs: string[] = [];
  for (const host of active()) {
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

function verdict(grades: Grade[], baseline: Baseline, write: Write, control = false): number {
  const broken = grades.filter((g) => g.error !== undefined);
  // The control proves the gate: its suite must run and pass against its own package. It
  // is not measured against burgee's baseline — real yargs scores 802 where burgee scores
  // 804 (its own version lookup from inside node_modules), and that is not a regression.
  const fell = control ? grades.filter((g) => g.passed === 0) : grades.filter((g) => regressed(g, baseline));
  for (const g of fell) write(`\n✖ ${g.host}: ${g.passed} passing, baseline was ${baseline[g.host]?.passed ?? 0}\n`);
  if (broken.length > 0) write(`\n✖ ${broken.length} host(s) could not be graded\n`);
  return fell.length + broken.length > 0 ? 1 : 0;
}

export async function main(argv: string[], write: Write): Promise<number> {
  if (argv.includes('--upstream')) return upstreamMode(write);

  const wantsVendor = argv.includes('--vendor');
  // --control grades each host against its own real package: the proof that the gate
  // works before it grades anything of ours (rule 4). --target= overrides all hosts.
  const control = argv.includes('--control');
  const target = (argv.find((a) => a.startsWith('--target='))?.split('=')[1] ?? '').trim();
  const targetFor = (host: { name: string; target: string }): string => {
    if (control) return host.name;
    return target === '' ? host.target : target;
  };

  if (wantsVendor) vendorAll(write);

  const baseline = readBaseline(BASELINE);
  const grades = active().map((host) => grade(host, VENDOR_DIR, targetFor(host), baseline[host.name]?.reference ?? 0));

  write(control ? '\ncontrol — each host graded against its real package\n\n' : '\ncompatibility\n\n');
  for (const g of grades) write(gradeLines(g, baseline));

  const planned = HOSTS.filter((h) => h.status === 'planned').map((h) => h.name);
  if (planned.length > 0) write(`\n  planned: ${planned.join(', ')}\n`);

  writeFileSync(control ? CONTROL_RESULTS : RESULTS, `${JSON.stringify({ measured: new Date().toISOString(), grades }, null, 2)}\n`);
  return verdict(grades, baseline, write, control);
}
