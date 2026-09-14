/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * PLAN 5.1 — every package README points at the measured numbers.
 *
 * Written by a script rather than by hand because ten sections written by hand are ten
 * sections that rot separately, and this repository has watched exactly that: the published
 * compatibility table said `flagstaff/table` 0 / 29 for days after the row was graded 29 / 29,
 * because nothing compared the two.
 *
 * So the section is generated from what was actually measured — `baseline/<host>.json` for
 * the graded rate and `.sdlc/bands/foundation-ceilings.json` for the weight ratio — and it
 * says plainly when a number does not exist yet. A package with nothing measured gets the
 * link and no claim, which is the honest shape for `bellpull` today.
 *
 *   npx tsx scripts/readme-benchmarks.ts          # write
 *   npx tsx scripts/readme-benchmarks.ts --check  # exit 1 on drift
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');
const BASELINE = join(PACKAGES, 'compat-oracle/baseline');
const CEILINGS = join(ROOT, '.sdlc/bands/foundation-ceilings.json');
const PAGE = '/docs/benchmarks';
const HEADING = '## Benchmarks';

interface Ceiling {
  ours: number;
  ceiling: number;
  ratio: number;
  unmeasured?: string[];
}

const ceilings = (): Record<string, Ceiling> =>
  existsSync(CEILINGS) ? (JSON.parse(readFileSync(CEILINGS, 'utf8')) as { layers: Record<string, Ceiling> }).layers : {};

/** Which incumbents this package is graded against, and at what rate. */
function graded(pkg: string): string[] {
  if (!existsSync(BASELINE)) return [];
  const rows: string[] = [];
  for (const file of readdirSync(BASELINE).filter((f) => f.endsWith('.json')).sort()) {
    const host = file.slice(0, -'.json'.length);
    const entry = JSON.parse(readFileSync(join(BASELINE, file), 'utf8')) as { reference: number; passed: number };
    const hosts = readFileSync(join(PACKAGES, 'compat-oracle/src/hosts.ts'), 'utf8');
    // The host entry names its target; `linegauge/strip` belongs to linegauge.
    const at = hosts.indexOf(`name: '${host}'`);
    if (at === -1) continue;
    const target = /target: '([^']+)'/.exec(hosts.slice(at))?.[1] ?? '';
    if (target.split('/')[0] !== pkg) continue;
    rows.push(`| \`${host}\` | ${String(entry.passed)} / ${String(entry.reference)} |`);
  }
  return rows;
}

export function section(pkg: string): string {
  const rows = graded(pkg);
  const weight = ceilings()[pkg];
  const lines = [HEADING, '', `Every number here is produced by \`npm run bench\` and published at [${PAGE}](${PAGE}).`, ''];
  if (rows.length > 0) {
    lines.push("Graded by the incumbent's own test suite:", '', '| suite | passing |', '| :-- | --: |', ...rows, '');
  } else {
    lines.push('No suite is graded against this package yet, so there is no compatibility number to quote.', '');
  }
  if (weight !== undefined) {
    const caveat = (weight.unmeasured?.length ?? 0) > 0 ? ` (${weight.unmeasured?.join(', ') ?? ''} not installed here, so the ceiling is understated)` : '';
    lines.push(
      `Weight, installed and tree-inclusive: **${weight.ours.toLocaleString('en-US')} bytes** against **${weight.ceiling.toLocaleString('en-US')}** for the incumbents it replaces — a ratio of **${String(weight.ratio)}**${caveat}.`,
      '',
    );
    // A weight ratio is only a claim once the package does the incumbent's job. `bellpull`
    // weighs 0.007 of what it replaces and passes 0 of 68 cases — accurate, and misleading
    // without this line, which is the difference between honest and merely true.
    if (!rows.some((r) => !r.includes('| 0 /'))) {
      lines.push('That ratio is not yet a claim: nothing here passes an incumbent suite, so it is the weight of a package that does not do the job.', '');
    }
  }
  return lines.join('\n');
}

/** The README with its benchmark section replaced, or added before the licence. */
export function rewrite(text: string, pkg: string): string {
  const body = section(pkg);
  const at = text.indexOf(`${HEADING}\n`);
  if (at !== -1) {
    const rest = text.slice(at + HEADING.length);
    const next = rest.indexOf('\n## ');
    return text.slice(0, at) + body + (next === -1 ? '' : rest.slice(next + 1));
  }
  const licence = text.search(/^## Licence/m);
  return licence === -1 ? `${text.trimEnd()}\n\n${body}` : `${text.slice(0, licence)}${body}\n${text.slice(licence)}`;
}

if (process.argv[1]?.endsWith('readme-benchmarks.ts') === true) {
  const check = process.argv.slice(2).includes('--check');
  const drifted: string[] = [];
  for (const pkg of readdirSync(PACKAGES)) {
    const at = join(PACKAGES, pkg, 'README.md');
    if (!existsSync(at)) continue;
    const before = readFileSync(at, 'utf8');
    const after = rewrite(before, pkg);
    if (before === after) continue;
    if (check) drifted.push(`packages/${pkg}/README.md`);
    else writeFileSync(at, after);
  }
  if (check && drifted.length > 0) {
    process.stderr.write(`✖ these READMEs do not match the measurements:\n${drifted.map((d) => `  ${d}`).join('\n')}\nRun \`npx tsx scripts/readme-benchmarks.ts\`.\n`);
    process.exitCode = 1;
  } else if (check) process.stdout.write('✓ every README matches the measurements\n');
  else process.stdout.write(`wrote ${String(readdirSync(PACKAGES).length)} package READMEs\n`);
}
