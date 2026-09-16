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
/**
 * A fixed width, because this string feeds back into the number it prints.
 *
 * `ours` is measured from a tarball that contains this README, so writing the ratio changes the
 * package's size, which changes the ratio. With a variable-width `String(ratio)` that is not a
 * fixed point but a **two-cycle**: paratext oscillated 58,330 → 58,329 → 58,330 forever, because
 * `1.887` is five characters and `1.8869` is six. At constant width the feedback still exists —
 * a byte is a byte — but it cannot flip the length, so one iteration settles it.
 */
const RATIO_DIGITS = 4;
const HEADING = '## Benchmarks';
const PLACE_HEADING = '## Where it sits';
/** The nine published layers. `compat-oracle` is internal tooling and is not one of them. */
const FAMILY = ['burgee', 'roundel', 'flagstaff', 'caique', 'linegauge', 'paratext', 'seniority', 'closeout', 'bellpull'];

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
    const entry = JSON.parse(readFileSync(join(BASELINE, file), 'utf8')) as { reference: number; passed: number; exceeded?: number };
    const hosts = readFileSync(join(PACKAGES, 'compat-oracle/src/hosts.ts'), 'utf8');
    // The host entry names its target; `linegauge/strip` belongs to linegauge.
    const at = hosts.indexOf(`name: '${host}'`);
    if (at === -1) continue;
    const target = /target: '([^']+)'/.exec(hosts.slice(at))?.[1] ?? '';
    if (target.split('/')[0] !== pkg) continue;
    // A case the host's own suite marks `failing` that we pass counts as a pass — and is
    // marked, because it is not the same kind of pass as the ones beside it.
    const over = entry.exceeded === undefined || entry.exceeded === 0 ? '' : ' \u00b9';
    rows.push(`| \`${host}\` | ${String(entry.passed)} / ${String(entry.reference)}${over} |`);
  }
  return rows;
}

export function section(pkg: string): string {
  const rows = graded(pkg);
  const weight = ceilings()[pkg];
  const lines = [HEADING, '', `Every number here is produced by \`npm run bench\` and published at [${PAGE}](${PAGE}).`, ''];
  if (rows.length > 0) {
    lines.push("Graded by the incumbent's own test suite:", '', '| suite | passing |', '| :-- | --: |', ...rows, '');
    if (rows.some((r) => r.includes('\u00b9'))) {
      lines.push(
        '¹ A case the incumbent marks `test.failing()` — it cannot do the thing and says so in',
        'its own suite — which this package passes. The runner reports that as a failure, because',
        'to the incumbent an unexpected pass means a stale annotation; it is counted here as the',
        'pass it is, and marked rather than left to look like the ones beside it.',
        '',
      );
    }
  } else {
    lines.push('No suite is graded against this package yet, so there is no compatibility number to quote.', '');
  }
  if (weight !== undefined) {
    const caveat = (weight.unmeasured?.length ?? 0) > 0 ? ` (${weight.unmeasured?.join(', ') ?? ''} not installed here, so the ceiling is understated)` : '';
    lines.push(
      `Weight, installed and tree-inclusive: **${weight.ours.toLocaleString('en-US')} bytes** against **${weight.ceiling.toLocaleString('en-US')}** for the incumbents it replaces — a ratio of **${weight.ratio.toFixed(RATIO_DIGITS)}**${caveat}.`,
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

/**
 * The plugin keys this package hosts, read off its own `export interface Plugin` — every host
 * declares one, and its members besides `name` and `contract` *are* the keys.
 *
 * Not a list kept here: a second copy of the host table is a second thing to keep in step, and
 * the drift would be invisible. The first version of this function matched a fixed alternation
 * of key names and reported flagstaff as hosting none, because it hosts four the alternation
 * had never heard of — which is the whole argument against writing the list down twice.
 */
export function pluginKeys(pkg: string): string[] {
  const at = join(PACKAGES, pkg, 'src/plugin.ts');
  if (!existsSync(at)) return [];
  const body = /^export interface Plugin \{$([\s\S]*?)^\}$/m.exec(readFileSync(at, 'utf8'))?.[1] ?? '';
  // `name` and `contract` are the envelope every plugin carries. `enforce` is burgee's ordering
  // hint — a plugin sets it to say *when* its hooks run, not to contribute anything — so calling
  // it a key plugins "register under" is wrong in the one sentence a consumer reads.
  const NOT_A_CONTRIBUTION = new Set(['name', 'contract', 'enforce']);
  return [...body.matchAll(/^ {2}([a-zA-Z]+)\??:/gm)].map((m) => m[1] as string).filter((k) => !NOT_A_CONTRIBUTION.has(k));
}

/** Which packages of the family this one depends on, and which depend on it — from the manifests. */
function edges(pkg: string): { below: string[]; above: string[] } {
  const deps = (p: string): string[] => {
    const at = join(PACKAGES, p, 'package.json');
    if (!existsSync(at)) return [];
    const m = JSON.parse(readFileSync(at, 'utf8')) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
    return Object.keys({ ...m.dependencies, ...m.peerDependencies }).filter((d) => FAMILY.includes(d));
  };
  return { below: deps(pkg).sort(), above: FAMILY.filter((other) => other !== pkg && deps(other).includes(pkg)).sort() };
}

const list = (names: string[]): string => names.map((n) => `\`${n}\``).join(names.length === 2 ? ' and ' : ', ');

/**
 * PLAN 5.2 — where this package sits in the family, generated from the manifests and from
 * each package's own `plugin.ts`. Two facts, both of which a hand-written paragraph gets
 * wrong the first time a dependency moves: which key plugins register under, and what is
 * above and below it.
 */
export function place(pkg: string): string {
  if (!FAMILY.includes(pkg)) return '';
  const keys = pluginKeys(pkg);
  const { below, above } = edges(pkg);
  const lines = [PLACE_HEADING, ''];
  // burgee is the framework rather than a host: it declares the plugin *shape* every layer
  // registers against, and hosts no key of its own. Saying "hosts no plugins" of the package
  // that defines what a plugin is would be true and useless.
  const defines = existsSync(join(PACKAGES, pkg, 'src/manifest.ts')) && readFileSync(join(PACKAGES, pkg, 'src/manifest.ts'), 'utf8').includes('export function definePlugin');
  const hosts = (): string => {
    if (keys.length > 0) return `Plugins register under the ${list(keys)} key${keys.length === 1 ? '' : 's'}, against the one schema the whole family shares.`;
    if (defines) return 'It declares the plugin shape the rest of the family registers against, and hosts no key of its own.';
    return 'It hosts no plugin key of its own.';
  };
  lines.push(hosts(), '');
  // "Nothing" is the interesting answer here, not a gap: a package the rest of the family can
  // adopt one at a time is the point of splitting them up, and a layer with no edges in either
  // direction is one a program can take on its own.
  const verb = above.length === 1 ? 'builds' : 'build';
  const up = above.length === 0 ? 'Nothing in this family builds on it yet' : `${list(above)} ${verb} on it`;
  const down = below.length === 0 ? 'it builds on nothing in this family' : `it builds on ${list(below)}`;
  lines.push(`${up}, and ${down}.`, '');
  return lines.join('\n');
}

/** The README with its benchmark section replaced, or added before the licence. */
function replaceSection(text: string, heading: string, body: string): string {
  if (body === '') return text;
  const at = text.indexOf(`${heading}\n`);
  if (at !== -1) {
    const rest = text.slice(at + heading.length);
    const next = rest.indexOf('\n## ');
    return text.slice(0, at) + body + (next === -1 ? '' : rest.slice(next + 1));
  }
  const licence = text.search(/^## Licence/m);
  return licence === -1 ? `${text.trimEnd()}\n\n${body}` : `${text.slice(0, licence)}${body}\n${text.slice(licence)}`;
}

export function rewrite(text: string, pkg: string): string {
  return replaceSection(replaceSection(text, HEADING, section(pkg)), PLACE_HEADING, place(pkg));
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
