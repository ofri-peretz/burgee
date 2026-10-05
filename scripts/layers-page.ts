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
 * refuses only what would make the picture wrong: an edge out of the family would have no box to
 * point at. A package's row is its depth above the leaves, so every edge points down and any
 * depth draws (controlroom, over caique and flagstaff, was the first third row, 2026-10-05).
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
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

interface Node {
  readonly name: string;
  readonly uses: readonly string[];
  readonly outside: readonly string[];
  /** Peers marked optional: never installed, so not an edge — the program brings its own (controlroom R11, D-111's one exception). */
  readonly optionalPeers: readonly string[];
  readonly role: 'composes' | 'leaf' | 'reserved';
}

const manifests: Manifest[] = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(root, 'packages', e.name, 'package.json')))
  .map((e) => JSON.parse(readFileSync(join(root, 'packages', e.name, 'package.json'), 'utf8')) as Manifest)
  .filter((m) => m.private !== true)
  .toSorted((a, b) => a.name.localeCompare(b.name));

const family = new Set(manifests.map((m) => m.name));

const nodes: Node[] = manifests.map((m) => {
  const optionalPeers = Object.keys(m.peerDependencies ?? {})
    .filter((d) => !family.has(d) && m.peerDependenciesMeta?.[d]?.optional === true)
    .toSorted();
  const declared = Object.keys({ ...m.dependencies, ...m.peerDependencies, ...m.optionalDependencies })
    .filter((d) => !optionalPeers.includes(d))
    .toSorted();
  const uses = declared.filter((d) => family.has(d));
  let role: Node['role'] = uses.length > 0 ? 'composes' : 'leaf';
  if ((m.description ?? '').startsWith('Reserved')) role = 'reserved';
  return { name: m.name, uses, outside: declared.filter((d) => !family.has(d)), optionalPeers, role };
});

const composers = nodes.filter((n) => n.role === 'composes');
const leaves = nodes.filter((n) => n.role === 'leaf');
const reserved = nodes.filter((n) => n.role === 'reserved');
const edges = composers.flatMap((c) => c.uses.map((to) => [c.name, to] as const));

const problems = [
  ...nodes.flatMap((n) => n.outside.map((d) => `${n.name} depends on ${d}, which is outside the family`)),
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
/** From one layer's top to the next one's. */
const ROW_STEP = 120;
const BOX_W = 108;
/** Room under the bottom layer: a row for the reserved packages, or a margin. */
const FOOT_RESERVED = 64;
const FOOT = 24;
/** Where a label's baseline sits inside its box, and the gap above the reserved row. */
const LABEL_Y = 25;
const RESERVED_GAP = 16;
const RESERVED_W = 200;
/** The reserved row's left margin, and the gap between its boxes. */
const RESERVED_MARGIN = 24;
/** Arrows from different packages land this far apart on a box, so their heads do not overlap. */
const LANE = 14;
const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ef4444'];
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * A package's layer is how far it sits above the leaves: a leaf is 0, and one that uses others is
 * one more than the highest of them. So every edge points down at least one layer, and a
 * package that composes composers (controlroom, over caique and flagstaff) gets a row of its own.
 */
const depthOf = new Map<string, number>();
const depth = (name: string): number => {
  const known = depthOf.get(name);
  if (known !== undefined) return known;
  const uses = nodes.find((n) => n.name === name && n.role !== 'reserved')?.uses ?? [];
  const d = uses.length === 0 ? 0 : 1 + Math.max(...uses.map(depth));
  depthOf.set(name, d);
  return d;
};
const drawn = [...composers, ...leaves];
const top = Math.max(0, ...drawn.map((n) => depth(n.name)));
/** Layers top to bottom: the most composed first, the leaves last. */
const layers = Array.from({ length: top + 1 }, (_, r) => drawn.filter((n) => depth(n.name) === top - r));
const LEAF_Y = TOP_Y + top * ROW_STEP;
const HEIGHT = LEAF_Y + BOX_H + (reserved.length > 0 ? FOOT_RESERVED : FOOT);

/** Where each drawn package's box sits, by name. */
const place = new Map<string, { x: number; y: number }>();
layers.forEach((layer, r) => {
  const gap = (WIDTH - layer.length * BOX_W) / (layer.length + 1);
  layer.forEach((n, i) => place.set(n.name, { x: gap + i * (BOX_W + gap), y: TOP_Y + r * ROW_STEP }));
});
const spot = (name: string): { x: number; y: number } => place.get(name) as { x: number; y: number };

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

const colour = (i: number): string => PALETTE[i % PALETTE.length] as string;

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-labelledby="t d">`,
  '  <title id="t">The burgee family\'s dependency graph</title>',
  `  <desc id="d">${composers.map((c) => `${c.name} depends on ${c.uses.join(', ')}`).join('. ')}. ${leaves.map((l) => l.name).join(', ')} depend on nothing.${reserved.map((r) => ` ${r.name} is reserved${r.uses.length > 0 ? `; it will depend on ${r.uses.join(', ')} when it publishes, and is drawn apart until then` : ' and depends on nothing'}.`).join('')}</desc>`,
  '  <defs>',
  ...composers.map((_, i) => `    <marker id="a${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${colour(i)}"/></marker>`),
  '  </defs>',
  ...composers.flatMap((c, i) =>
    c.uses.map((to) => {
      const from = spot(c.name);
      const dest = spot(to);
      const x1 = from.x + BOX_W / 2;
      const x2 = dest.x + BOX_W / 2 + (i - (composers.length - 1) / 2) * LANE;
      return `  <line x1="${x1.toFixed(1)}" y1="${from.y + BOX_H}" x2="${x2.toFixed(1)}" y2="${dest.y - 2}" stroke="${colour(i)}" stroke-width="2" marker-end="url(#a${i})"/>`;
    }),
  ),
  ...composers.map((c, i) => box({ ...spot(c.name), w: BOX_W, label: c.name, stroke: colour(i) })),
  ...leaves.map((l) => box({ ...spot(l.name), w: BOX_W, label: l.name, stroke: '#71717a' })),
  ...reserved.map((r, k) => box({ x: RESERVED_MARGIN + k * (RESERVED_W + RESERVED_MARGIN), y: LEAF_Y + BOX_H + RESERVED_GAP, w: RESERVED_W, label: `${r.name} (reserved)`, stroke: '#a1a1aa', dashed: true })),
  '</svg>',
  '',
].join('\n');

// ── The same graph as text ─────────────────────────────────────────────────────────────────

const pkgLink = (name: string): string => `\`${name}\``;
const rows = [...composers, ...leaves, ...reserved].map((n) => {
  // A reserved package is published as a placeholder. Its manifest may already declare what the
  // repository's unreleased code uses; those edges are listed, and drawn once it publishes.
  const reservedLayer = n.uses.length > 0 ? 'reserved on npm; built in the repository' : 'reserved, no API yet';
  const layer = n.role === 'reserved' ? reservedLayer : n.role;
  const outside = [...n.outside, ...n.optionalPeers.map((d) => `${d} (optional peer)`)];
  const users = composers.filter((c) => c.uses.includes(n.name)).map((c) => pkgLink(c.name));
  return `| ${pkgLink(n.name)} | ${layer} | ${n.uses.length === 0 ? 'nothing' : n.uses.map(pkgLink).join(', ')} | ${users.length === 0 ? '—' : users.join(', ')} | ${outside.length === 0 ? 'nothing' : outside.join(', ')} |`;
});

const block = [
  START,
  '',
  `![The family's dependency graph: ${composers.map((c) => `${c.name} depends on ${c.uses.join(', ')}`).join('; ')}. The ${leaves.length} leaves depend on nothing.](${SVG_URL})`,
  '',
  `${composers.length} packages compose, ${leaves.length} are leaves${reserved.length > 0 ? `, and ${reserved.length} is reserved` : ''}: ${edges.length} dependency edges inside the family, every one pointing down at least one layer, and none outside it. Generated by \`npm run layers:page\` from each public package's \`package.json\`; do not edit by hand.`,
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
