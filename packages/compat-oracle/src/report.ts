/**
 * `npm run compat` — vendor, grade, print, ratchet.
 *
 * Exits non-zero when any active host's pass count falls below its recorded
 * baseline (C5), so the number can only go up without a deliberate edit.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { active, HOSTS } from './hosts.js';
import { type Baseline, type Grade, grade, readBaseline, regressed } from './run.js';
import { vendor } from './vendor.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR_DIR = resolve(root, 'vendor');
const BASELINE = resolve(root, 'baseline.json');
const RESULTS = resolve(root, 'results.json');

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
  return `  ${g.host.padEnd(HOST_COL)} ${bar(g.rate)} ${counts} ${pct}${arrow(g, baseline[g.host])}`;
}

export type Write = (s: string) => void;

export async function main(argv: string[], write: Write): Promise<number> {
  const wantsVendor = argv.includes('--vendor');
  // --control grades each host against its own real package: the proof that the gate
  // works before it grades anything of ours (rule 4). --target= overrides all hosts.
  const control = argv.includes('--control');
  const target = (argv.find((a) => a.startsWith('--target='))?.split('=')[1] ?? '').trim();
  const targetFor = (host: { name: string; target: string }): string => {
    if (control) return host.name;
    return target === '' ? host.target : target;
  };

  if (wantsVendor) {
    mkdirSync(VENDOR_DIR, { recursive: true });
    for (const host of active()) {
      const result = vendor(host, VENDOR_DIR);
      write(
        `vendored ${result.host} @ ${result.commit.slice(0, SHORT_SHA)} — ${result.files} files, ${result.excluded.length} excluded\n`,
      );
    }
  }

  const baseline = readBaseline(BASELINE);
  const grades = active().map((host) => grade(host, VENDOR_DIR, targetFor(host), baseline[host.name]?.reference ?? 0));

  write(control ? '\ncontrol — each host graded against its real package\n\n' : '\ncompatibility\n\n');
  for (const g of grades) write(`${line(g, baseline)}\n`);

  const planned = HOSTS.filter((h) => h.status === 'planned').map((h) => h.name);
  if (planned.length > 0) write(`\n  planned: ${planned.join(', ')}\n`);

  writeFileSync(RESULTS, `${JSON.stringify({ measured: new Date().toISOString(), grades }, null, 2)}\n`);

  const broken = grades.filter((g) => g.error !== undefined);
  const fell = grades.filter((g) => regressed(g, baseline));
  for (const g of fell) {
    write(`\n✖ ${g.host}: ${g.passed} passing, baseline was ${baseline[g.host]?.passed ?? 0}\n`);
  }
  if (broken.length > 0) write(`\n✖ ${broken.length} host(s) could not be graded\n`);

  return fell.length + broken.length > 0 ? 1 : 0;
}
