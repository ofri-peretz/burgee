/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Generates the family's dependency diagram, from the manifests and nothing else.
 *
 * Two outputs, one source. `apps/docs/public/concepts/family-layers.svg` is the picture, and the
 * block between `layers:start` and `layers:end` in `apps/docs/content/docs/concepts/family.mdx`
 * is the same graph as a table — the text form a screen reader, a pipe and the page's `.md` twin
 * read. Both come from each public package's `dependencies`, `peerDependencies` and
 * `optionalDependencies`, so neither can show an edge the manifests do not declare.
 *
 * A package's layer is read, never listed: one with no dependency inside the family is a leaf,
 * one with any composes, and one whose npm description begins "Reserved" is drawn apart with no
 * edges. The rules the picture illustrates are enforced elsewhere —
 * `scripts/layer-boundaries-lock.test.ts`, `scripts/inline-implementation-lock.test.ts`,
 * `scripts/composition-lock.test.ts` and `scripts/dependency-claim-lock.test.ts` — so this script
 * refuses only what would make the picture wrong: a leaf-to-leaf edge would have no row to be
 * drawn in, and an edge out of the family would have no box to point at.
 *
 * `--check` regenerates both and compares, and runs in the `fast` job the required
 * `Quality Gate` reads.
 *
 *   npx tsx scripts/layers-page.ts [--check]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE = join(root, 'apps/docs/content/docs/concepts/family.mdx');
const SVG = join(root, 'apps/docs/public/concepts/family-layers.svg');
const SVG_URL = '/concepts/family-layers.svg';
const START = '{/* layers:start */}';
const END = '{/* layers:end */}';

interface Manifest {
  name: string;
  description?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface Node {
  readonly name: string;
  readonly uses: readonly string[];
  readonly outside: readonly string[];
  readonly role: 'composes' | 'leaf' | 'reserved';
}

const manifests: Manifest[] = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(root, 'packages', e.name, 'package.json')))
  .map((e) => JSON.parse(readFileSync(join(root, 'packages', e.name, 'package.json'), 'utf8')) as Manifest)
  .filter((m) => m.private !== true)
  .toSorted((a, b) => a.name.localeCompare(b.name));

const family = new Set(manifests.map((m) => m.name));

const nodes: Node[] = manifests.map((m) => {
  const declared = Object.keys({ ...m.dependencies, ...m.peerDependencies, ...m.optionalDependencies }).toSorted();
  const uses = declared.filter((d) => family.has(d));
  let role: Node['role'] = uses.length > 0 ? 'composes' : 'leaf';
  if ((m.description ?? '').startsWith('Reserved')) role = 'reserved';
  return { name: m.name, uses, outside: declared.filter((d) => !family.has(d)), role };
});

const composers = nodes.filter((n) => n.role === 'composes');
const leaves = nodes.filter((n) => n.role === 'leaf');
const reserved = nodes.filter((n) => n.role === 'reserved');
const edges = composers.flatMap((c) => c.uses.map((to) => [c.name, to] as const));

const problems = [
  ...nodes.flatMap((n) => n.outside.map((d) => `${n.name} depends on ${d}, which is outside the family`)),
  ...edges.filter(([, to]) => !leaves.some((l) => l.name === to)).map(([from, to]) => `${from} → ${to} does not end at a leaf; the diagram has two rows`),
  ...reserved.filter((n) => n.uses.length > 0).map((n) => `${n.name} is reserved but declares ${n.uses.join(', ')}`),
];
if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`✖ ${p}\n`);
  process.exit(1);
}

// ── The picture ────────────────────────────────────────────────────────────────────────────
// Served as an <img>, so it cannot read the site's theme: every colour is chosen to read on
// both the light and the dark page, and each box carries its own fill.

const WIDTH = 760;
const BOX_H = 40;
const TOP_Y = 24;
const LEAF_Y = 196;
const LEAF_W = 108;
const TOP_W = 140;
/** Room under the leaves: a row for the reserved packages, or a margin. */
const FOOT_RESERVED = 64;
const FOOT = 24;
/** Where a label's baseline sits inside its box, and the gap above the reserved row. */
const LABEL_Y = 25;
const RESERVED_GAP = 16;
const RESERVED_W = 200;
/** Arrows from different composers land this far apart on a leaf, so their heads do not overlap. */
const LANE = 18;
const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7'];
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const leafGap = (WIDTH - leaves.length * LEAF_W) / (leaves.length + 1);
const leafX = (i: number): number => leafGap + i * (LEAF_W + leafGap);
const topX = (i: number): number => (WIDTH * (i + 1)) / (composers.length + 1) - TOP_W / 2;
const HEIGHT = LEAF_Y + BOX_H + (reserved.length > 0 ? FOOT_RESERVED : FOOT);

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly label: string;
  readonly stroke: string;
  readonly dashed?: boolean;
}

const box = ({ x, y, w, label, stroke, dashed = false }: Box): string =>
  [
    `  <rect x="${x.toFixed(1)}" y="${y}" width="${w}" height="${BOX_H}" rx="6" fill="#f4f4f5" stroke="${stroke}" stroke-width="2"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`,
    `  <text x="${(x + w / 2).toFixed(1)}" y="${y + LABEL_Y}" text-anchor="middle" font-family="${MONO}" font-size="14" fill="#18181b">${label}</text>`,
  ].join('\n');

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-labelledby="t d">`,
  '  <title id="t">The burgee family\'s dependency graph</title>',
  `  <desc id="d">${composers.map((c) => `${c.name} depends on ${c.uses.join(', ')}`).join('. ')}. ${leaves.map((l) => l.name).join(', ')} depend on nothing.${reserved.length > 0 ? ` ${reserved.map((r) => r.name).join(', ')} is reserved and depends on nothing.` : ''}</desc>`,
  '  <defs>',
  ...composers.map((_, i) => `    <marker id="a${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${PALETTE[i % PALETTE.length]}"/></marker>`),
  '  </defs>',
  ...composers.flatMap((c, i) =>
    c.uses.map((to) => {
      const j = leaves.findIndex((l) => l.name === to);
      const x1 = topX(i) + TOP_W / 2;
      const x2 = leafX(j) + LEAF_W / 2 + (i - (composers.length - 1) / 2) * LANE;
      return `  <line x1="${x1.toFixed(1)}" y1="${TOP_Y + BOX_H}" x2="${x2.toFixed(1)}" y2="${LEAF_Y - 2}" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="2" marker-end="url(#a${i})"/>`;
    }),
  ),
  ...composers.map((c, i) => box({ x: topX(i), y: TOP_Y, w: TOP_W, label: c.name, stroke: PALETTE[i % PALETTE.length] as string })),
  ...leaves.map((l, j) => box({ x: leafX(j), y: LEAF_Y, w: LEAF_W, label: l.name, stroke: '#71717a' })),
  ...reserved.map((r, k) => box({ x: leafGap + k * (RESERVED_W + leafGap), y: LEAF_Y + BOX_H + RESERVED_GAP, w: RESERVED_W, label: `${r.name} (reserved)`, stroke: '#a1a1aa', dashed: true })),
  '</svg>',
  '',
].join('\n');

// ── The same graph as text ─────────────────────────────────────────────────────────────────

const pkgLink = (name: string): string => `\`${name}\``;
const rows = [...composers, ...leaves, ...reserved].map((n) => {
  const layer = n.role === 'reserved' ? 'reserved, no API yet' : n.role;
  const users = composers.filter((c) => c.uses.includes(n.name)).map((c) => pkgLink(c.name));
  return `| ${pkgLink(n.name)} | ${layer} | ${n.uses.length === 0 ? 'nothing' : n.uses.map(pkgLink).join(', ')} | ${users.length === 0 ? '—' : users.join(', ')} | ${n.outside.length === 0 ? 'nothing' : n.outside.join(', ')} |`;
});

const block = [
  START,
  '',
  `![The family's dependency graph: ${composers.map((c) => `${c.name} depends on ${c.uses.join(', ')}`).join('; ')}. The ${leaves.length} leaves depend on nothing.](${SVG_URL})`,
  '',
  `${composers.length} packages compose, ${leaves.length} are leaves${reserved.length > 0 ? `, and ${reserved.length} is reserved` : ''}: ${edges.length} dependency edges inside the family, every one from a package that composes to a leaf, and none outside it. Generated by \`npm run layers:page\` from each public package's \`package.json\`; do not edit by hand.`,
  '',
  '| Package | Layer | Depends on | Used by | Outside the family |',
  '| :--- | :--- | :--- | :--- | :--- |',
  ...rows,
  '',
  END,
].join('\n');

const page = existsSync(PAGE) ? readFileSync(PAGE, 'utf8') : '';
const at = page.indexOf(START);
const end = page.indexOf(END);
if (at === -1 || end === -1) {
  process.stderr.write(`✖ ${PAGE} has no ${START} … ${END} block\n`);
  process.exit(1);
}
const withBlock = `${page.slice(0, at)}${block}${page.slice(end + END.length)}`;

const targets: [string, string, string][] = [
  [PAGE, page, withBlock],
  [SVG, existsSync(SVG) ? readFileSync(SVG, 'utf8') : '', svg],
];
if (process.argv.includes('--check')) {
  const stale = targets.filter(([, committed, want]) => committed !== want).map(([file]) => file);
  for (const file of stale) process.stderr.write(`✖ ${file} is not what the manifests generate — run \`npm run layers:page\`\n`);
  if (stale.length > 0) process.exit(1);
  process.stdout.write('✓ the family diagram and its table match the manifests\n');
} else {
  mkdirSync(dirname(SVG), { recursive: true });
  for (const [file, , want] of targets) writeFileSync(file, want);
  process.stdout.write(`wrote ${SVG} and the block in ${PAGE}\n`);
}
