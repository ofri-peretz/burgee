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
 * The same argument covers everything else the nine READMEs share, so it is generated here too:
 * the **badge rows** under each tagline — every figure on them read from the manifest, the
 * compatibility baseline or a live service, never typed — and the **`## The family`**,
 * **`## Contributing`** and **`## Licence`** sections, which would otherwise be nine copies of one
 * table and two paragraphs. `package-readme-header-lock.test.ts` holds the standard they belong to.
 *
 *   npx tsx scripts/readme-benchmarks.ts          # write
 *   npx tsx scripts/readme-benchmarks.ts --check  # exit 1 on drift
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and its reader is the one place a package's docs URL is decided
import { packageDocsUrl } from '../apps/docs-chassis/src/config';
// eslint-disable-next-line import-next/no-relative-packages -- by path, for the same reason: what a package replaces is read out of its description once, there
import { replacesOf } from '../apps/docs-chassis/src/packages';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');
const BASELINE = join(PACKAGES, 'compat-oracle/baseline');
const CEILINGS = join(ROOT, '.sdlc/bands/foundation-ceilings.json');
/**
 * Absolute, because npm renders this README too, and a root-relative `/docs/benchmarks` there
 * resolves against npmjs.com.
 */
const PAGE = 'https://burgee.interlace.tools/docs/benchmarks';
const PAGE_TEXT = 'burgee.interlace.tools/docs/benchmarks';
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
/** The published layers. `compat-oracle` is internal tooling and is not one of them. */
export const FAMILY = ['burgee', 'roundel', 'flagstaff', 'caique', 'linegauge', 'paratext', 'seniority', 'closeout', 'bellpull', 'controlroom'];

interface Ceiling {
  ours: number;
  ceiling: number;
  ratio: number;
  unmeasured?: string[];
}

const ceilings = (): Record<string, Ceiling> =>
  existsSync(CEILINGS) ? (JSON.parse(readFileSync(CEILINGS, 'utf8')) as { layers: Record<string, Ceiling> }).layers : {};

/** One incumbent suite graded against this package, as `baseline/<host>.json` records it. */
export interface Grade {
  /** The oracle's name for the host — the baseline file's name. */
  host: string;
  /** The package on npm, when it is not the host's name: `clack` is `@clack/prompts`. */
  npm: string;
  /** The entry point graded: `linegauge/slice`, `burgee/commander`. */
  target: string;
  passed: number;
  reference: number;
  /** Cases the incumbent marks `failing` that this package passes. */
  exceeded: number;
}

/** Which incumbents this package is graded against, and at what rate. */
export function grades(pkg: string): Grade[] {
  if (!existsSync(BASELINE)) return [];
  const hosts = readFileSync(join(PACKAGES, 'compat-oracle/src/hosts.ts'), 'utf8');
  const out: Grade[] = [];
  for (const file of readdirSync(BASELINE).filter((f) => f.endsWith('.json')).sort()) {
    const host = file.slice(0, -'.json'.length);
    const entry = JSON.parse(readFileSync(join(BASELINE, file), 'utf8')) as { reference: number; passed: number; exceeded?: number };
    // The host entry names its target; `linegauge/strip` belongs to linegauge.
    const at = hosts.indexOf(`name: '${host}'`);
    if (at === -1) continue;
    const found = /target: '([^']+)'/.exec(hosts.slice(at));
    const target = found?.[1] ?? '';
    if (target.split('/')[0] !== pkg) continue;
    const npm = /npmName: '([^']+)'/.exec(hosts.slice(at, at + (found?.index ?? 0)))?.[1] ?? host;
    out.push({ host, npm, target, passed: entry.passed, reference: entry.reference, exceeded: entry.exceeded ?? 0 });
  }
  return out;
}

function graded(pkg: string): string[] {
  // A case the host's own suite marks `failing` that we pass counts as a pass — and is
  // marked, because it is not the same kind of pass as the ones beside it.
  return grades(pkg).map((g) => `| \`${g.host}\` | ${String(g.passed)} / ${String(g.reference)}${g.exceeded === 0 ? '' : ' \u00b9'} |`);
}

export function section(pkg: string): string {
  const rows = graded(pkg);
  const weight = ceilings()[pkg];
  const lines = [HEADING, '', `Every number here is produced by \`npm run bench\` and published at [${PAGE_TEXT}](${PAGE}).`, ''];
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
    const caveat = (weight.unmeasured?.length ?? 0) > 0 ? ` (${weight.unmeasured?.join(', ') ?? ''} measured but left out of the ceiling, so it is understated)` : '';
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

const deps = (p: string): string[] => {
  const at = join(PACKAGES, p, 'package.json');
  if (!existsSync(at)) return [];
  const m = JSON.parse(readFileSync(at, 'utf8')) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
  return Object.keys({ ...m.dependencies, ...m.peerDependencies }).filter((d) => FAMILY.includes(d));
};

/** Which packages of the family this one depends on, and which depend on it — from the manifests. */
function edges(pkg: string): { below: string[]; above: string[] } {
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

// ── the family header ─────────────────────────────────────────────────────────────────────

const REPO = 'ofri-peretz/burgee';
const BLOB = `https://github.com/${REPO}/blob/main`;
const SHIELDS = 'https://img.shields.io';
const STYLE = 'style=flat-square';
/** The brand green every badge the family owns is drawn in — the root README's too. */
const BRAND = '0a6b47';
/** A suite not yet passed whole: amber, so a partial grade never reads as the green beside it. */
const PARTIAL = 'b45309';
const COMPAT_PAGE = 'https://burgee.interlace.tools/docs/compatibility';
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

interface Manifest {
  name: string;
  description?: string;
  license?: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
}

const manifest = (pkg: string): Manifest => JSON.parse(readFileSync(join(PACKAGES, pkg, 'package.json'), 'utf8')) as Manifest;

/** The colour the reserved status was already drawn in, before this generator owned the row. */
const RESERVED_COLOUR = 'a84c17';

/**
 * A package published only to hold its name: its description opens "Reserved". Read from the
 * manifest, so the day the description stops saying so, every README stops saying so too.
 */
export const reserved = (pkg: string): boolean => /^Reserved\b/u.test(manifest(pkg).description ?? '');

/** A shields static-badge path segment: `-` and `_` doubled, as shields reads them, then percent-encoded. */
const seg = (text: string): string => encodeURIComponent(text.replaceAll('-', '--').replaceAll('_', '__'));

const badge = (href: string, src: string, alt: string): string => `  <a href="${href}"><img src="${src}" alt="${alt}" /></a>`;

/**
 * `^20.19.0 || >=22.13.0` → `20.19+ | 22.13+`: the claim `package-shape-lock.test.ts` requires of
 * every Node badge, read here from the package's own `engines` rather than typed.
 */
export function nodeClaim(range: string): string {
  return range
    .split('||')
    .map((r) => `${r.trim().replace(/^[\^>=]+/u, '').replace(/\.0$/u, '')}+`)
    .join(' | ');
}

/** Every export that resolves to JavaScript carries a `types` condition — the claim the types badge makes. */
function typed(m: Manifest): boolean {
  const entries = Object.values(m.exports ?? {}).map((v) => JSON.stringify(v));
  return entries.length > 0 && entries.filter((e) => e.includes('.js"')).every((e) => e.includes('"types"'));
}

/** The dependency badge, from the manifest: `0`, or `N in family, M outside`. */
function dependencyBadge(pkg: string, m: Manifest): string {
  const all = Object.keys(m.dependencies ?? {}).sort();
  const href = `${BLOB}/packages/${pkg}/package.json`;
  if (all.length === 0) return badge(href, `${SHIELDS}/badge/dependencies-0-${BRAND}?${STYLE}`, 'Zero dependencies');
  const inside = all.filter((d) => FAMILY.includes(d));
  const outside = all.filter((d) => !FAMILY.includes(d));
  const word = WORDS[all.length] ?? String(all.length);
  const where = outside.length === 0 ? `all in the burgee family (${inside.join(', ')}), none outside it` : `${String(inside.length)} in the burgee family, ${String(outside.length)} outside it (${outside.join(', ')})`;
  return badge(href, `${SHIELDS}/badge/dependencies-${seg(`${String(inside.length)} in family, ${String(outside.length)} outside`)}-${outside.length === 0 ? BRAND : PARTIAL}?${STYLE}`, `${word} dependenc${all.length === 1 ? 'y' : 'ies'}, ${where}`);
}

/**
 * The badge row every published README carries, in one order — so the family reads as one,
 * and a figure on a badge is the manifest's or a live service's, never one typed in a README.
 *
 * Kinds, in order: npm version · downloads · Quality Gate · this package's coverage (its Codecov
 * component) · OpenSSF Scorecard · unpacked size · dependencies · types · Node · licence · npm
 * provenance (read live from the registry's attestation, so it says "no result" the day a
 * release ships without one — as the reserved `controlroom@0.0.1` does).
 *
 * A **reserved** package — one whose description opens "Reserved" — carries a `status: reserved`
 * badge in the coverage slot instead. Its coverage would be the coverage of a placeholder, and
 * the one fact a reader needs from its row is that there is nothing to use yet.
 */
export function badges(pkg: string): string {
  const m = manifest(pkg);
  const npm = `https://www.npmjs.com/package/${pkg}`;
  const node = m.engines?.node;
  if (node === undefined) throw new Error(`packages/${pkg}/package.json declares no engines.node, so its README has no Node floor to state`);
  if (!typed(m)) throw new Error(`packages/${pkg}/package.json has an export with no types condition, so its README cannot claim types are included`);
  const registry = encodeURIComponent(`https://registry.npmjs.org/${pkg}/latest`);
  const rows = [
    badge(npm, `${SHIELDS}/npm/v/${pkg}?${STYLE}&color=${BRAND}`, `${pkg} on npm: the latest version`),
    badge(npm, `${SHIELDS}/npm/dm/${pkg}?${STYLE}`, `${pkg} downloads per month on npm`),
    badge(`https://github.com/${REPO}/actions/workflows/quality.yml?query=branch%3Amain`, `${SHIELDS}/github/actions/workflow/status/${REPO}/quality.yml?branch=main&${STYLE}&label=Quality%20Gate`, 'Quality Gate: the CI status of main'),
    reserved(pkg)
      ? badge(`https://github.com/${REPO}/tree/main/.sdlc/intents/${pkg}`, `${SHIELDS}/badge/status-reserved-${RESERVED_COLOUR}?${STYLE}`, 'Status: reserved, not usable yet')
      : badge(`https://app.codecov.io/gh/${REPO}/components`, `${SHIELDS}/codecov/c/github/${REPO}/main?component=${pkg}&${STYLE}`, `${pkg} line coverage: its Codecov component`),
    badge(`https://scorecard.dev/viewer/?uri=github.com/${REPO}`, `${SHIELDS}/ossf-scorecard/github.com/${REPO}?${STYLE}&label=OpenSSF%20Scorecard`, 'OpenSSF Scorecard for the repository'),
    badge(`${npm}?activeTab=code`, `${SHIELDS}/npm/unpacked-size/${pkg}?${STYLE}`, `Unpacked size of the latest ${pkg} release on npm`),
    dependencyBadge(pkg, m),
    badge(`${BLOB}/packages/${pkg}/package.json`, `${SHIELDS}/badge/types-included-blue?${STYLE}`, 'TypeScript types included for every entry point'),
    badge(`${BLOB}/packages/${pkg}/package.json`, `${SHIELDS}/badge/Node.js-${seg(nodeClaim(node))}-green?${STYLE}`, `Node.js ${nodeClaim(node).replaceAll(' | ', ' or ')}`),
    badge(`${BLOB}/packages/${pkg}/LICENSE`, `${SHIELDS}/badge/License-${seg(m.license ?? 'UNLICENSED')}-blue?${STYLE}`, `License: ${m.license ?? 'UNLICENSED'}`),
    badge(`${npm}#provenance`, `${SHIELDS}/badge/dynamic/json?url=${registry}&query=${encodeURIComponent('$.dist.attestations.provenance~')}&label=npm&${STYLE}&color=${BRAND}`, 'npm provenance of the latest release, read live from its registry attestation'),
  ];
  const suites = grades(pkg).map((g) => {
    const whole = g.passed >= g.reference;
    return badge(
      COMPAT_PAGE,
      `${SHIELDS}/badge/${seg(`${g.npm} suite`)}-${seg(`${String(g.passed)}/${String(g.reference)}`)}-${whole ? BRAND : PARTIAL}?${STYLE}`,
      `${g.target} passes ${String(g.passed)} of ${String(g.reference)} cases of the ${g.npm} test suite`,
    );
  });
  const blocks = [`<p align="center">\n${rows.join('\n')}\n</p>`];
  if (suites.length > 0) blocks.push(`<p align="center">\n${suites.join('\n')}\n</p>`);
  return blocks.join('\n\n');
}

/** A centred header block that is a badge row — an `<img>` with no lockup `<picture>` around it. */
const isBadgeRow = (block: string): boolean => block.includes('<img') && !block.includes('<picture');

/** The leading `<p>` blocks of a README — lockup, tagline, badges, docs line — and the line after them. */
export function headerBlocks(text: string): { blocks: string[]; end: number } {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    if (!line.startsWith('<p')) break;
    const start = i;
    while (i < lines.length && !(lines[i] ?? '').includes('</p>')) i += 1;
    i += 1;
    blocks.push(lines.slice(start, i).join('\n'));
  }
  return { blocks, end: i };
}

/** The README with its badge rows regenerated, just above the Docs line. */
function replaceBadges(text: string, pkg: string): string {
  if (!FAMILY.includes(pkg)) return text;
  const { blocks, end } = headerBlocks(text);
  const kept = blocks.filter((b) => !isBadgeRow(b));
  const docs = kept.findIndex((b) => b.includes('Docs:'));
  const at = docs === -1 ? kept.length : docs;
  const header = [...kept.slice(0, at), badges(pkg), ...kept.slice(at)].join('\n\n');
  return `${header}\n\n${text.split('\n').slice(end).join('\n').trimStart()}`;
}

// ── the family, contributing, licence ─────────────────────────────────────────────────────

const FAMILY_HEADING = '## The family';
const CONTRIBUTING_HEADING = '## Contributing';
const LICENCE_HEADING = '## Licence';

/**
 * What each package is, in a few words — the one hand-kept column of the family table, kept once
 * here rather than once per README. What each replaces is not kept at all: it is read
 * out of the package's own description, as the docs site's package map reads it.
 */
const ROLE: Readonly<Record<string, string>> = {
  burgee: 'The CLI framework: one declaration, every surface',
  roundel: 'Colour: one output policy, semantic tokens, a theme',
  flagstaff: 'The frame loop: spinners, progress, boxes and tables',
  caique: 'Prompts that are flags first, and never hang',
  linegauge: 'Measuring, wrapping, truncating and slicing styled text',
  paratext: 'Hyperlinks, images, title, clipboard and notifications',
  seniority: 'Configuration precedence and discovery, with provenance',
  closeout: 'Exit handlers, terminal restore and a bounded shutdown',
  bellpull: 'Subprocesses, and which executable actually ran',
  controlroom: 'Full-screen, keyboard-driven terminal screens',
};

/**
 * `## The family` — every sibling, one row each, generated so the copies cannot disagree. A
 * reserved package says so in both columns: what it will be is not what it is.
 */
export function family(pkg: string): string {
  if (!FAMILY.includes(pkg)) return '';
  const rows = FAMILY.map((name) => {
    const role = ROLE[name];
    if (role === undefined) throw new Error(`${name} has no ROLE in scripts/readme-benchmarks.ts, so the family table cannot say what it is`);
    const m = manifest(name);
    const outside = Object.keys(m.dependencies ?? {}).filter((d) => !FAMILY.includes(d));
    if (outside.length > 0) throw new Error(`${name} depends on ${outside.join(', ')}, outside the family — the family table's opening sentence would be false`);
    const cell = name === pkg ? `**${name}** (this package)` : `[${name}](${packageDocsUrl(name)})`;
    const replaces = replacesOf(name, m.description ?? '');
    return reserved(name) ? `| ${cell} | Reserved, not usable yet — planned: ${role.toLowerCase()} | ${replaces}, planned |` : `| ${cell} | ${role} | ${replaces} |`;
  });
  const count = WORDS[FAMILY.length] ?? String(FAMILY.length);
  return [
    FAMILY_HEADING,
    '',
    `${count} packages, one repository, one release pipeline. A CLI on burgee declares what it is, roundel`,
    'carries its colours, flagstaff flies it and caique answers back; each installs on its own, and none',
    'takes a dependency from outside the family.',
    '',
    '| Package | What it is | Replaces |',
    '| :-- | :-- | :-- |',
    ...rows,
    '',
    'Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)',
    'and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on',
    '[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).',
    '',
  ].join('\n');
}

/** `## Contributing` — the same three links in every README, generated for the same reason. */
export function contributing(pkg: string): string {
  if (!FAMILY.includes(pkg)) return '';
  return [
    CONTRIBUTING_HEADING,
    '',
    `Issues and pull requests are welcome at [${REPO}](https://github.com/${REPO}/issues); read`,
    `[CONTRIBUTING.md](${BLOB}/CONTRIBUTING.md) first. Report a vulnerability privately, as`,
    `[SECURITY.md](${BLOB}/SECURITY.md) describes — never in a public issue.`,
    '',
  ].join('\n');
}

/** `## Licence` — the manifest's licence, linked to the file that ships in the tarball. */
export function licence(pkg: string): string {
  if (!FAMILY.includes(pkg)) return '';
  return [LICENCE_HEADING, '', `${manifest(pkg).license ?? 'UNLICENSED'} © Ofri Peretz — see [LICENSE](${BLOB}/packages/${pkg}/LICENSE).`, ''].join('\n');
}

/**
 * The README with one generated section replaced in place, or — when it is missing — added just
 * before the licence. Each section is followed by one blank line, so a heading never sits on the
 * last row of the table above it.
 */
function replaceSection(text: string, heading: string, body: string): string {
  if (body === '') return text;
  const at = text.indexOf(`${heading}\n`);
  if (at !== -1) {
    const rest = text.slice(at + heading.length);
    const next = rest.indexOf('\n## ');
    const tail = next === -1 ? '' : rest.slice(next + 1);
    return text.slice(0, at) + body.trimEnd() + (tail === '' ? '\n' : '\n\n') + tail;
  }
  const licenceAt = text.search(/^## Licence/m);
  return licenceAt === -1 ? `${text.trimEnd()}\n\n${body.trimEnd()}\n` : `${text.slice(0, licenceAt)}${body.trimEnd()}\n\n${text.slice(licenceAt)}`;
}

export function rewrite(text: string, pkg: string): string {
  let out = replaceBadges(text, pkg);
  out = replaceSection(out, HEADING, section(pkg));
  out = replaceSection(out, PLACE_HEADING, place(pkg));
  out = replaceSection(out, LICENCE_HEADING, licence(pkg));
  out = replaceSection(out, FAMILY_HEADING, family(pkg));
  out = replaceSection(out, CONTRIBUTING_HEADING, contributing(pkg));
  return out;
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
