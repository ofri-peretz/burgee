/**
 * Writes apps/docs/content/docs/gallery.mdx from what flagstaff has actually registered.
 *
 * Every cell below is produced by running the component, not by describing it: the modes
 * table hoists each built-in over a buffer and a manual clock — the same `hoist()` a
 * program uses, through the same code path as `flagstaff check` — and the border gallery
 * calls `box()`. Nothing here is hand-drawn, which is the point of a gallery in a package
 * whose whole claim is about what its output looks like off a terminal. A screenshot would
 * rot; this cannot, because it fails the build when the projection changes.
 *
 * Run by `npm run gallery:page`, the way `compat-page.ts` is (B7, C2).
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import cliSpinners from 'cli-spinners';
import { box, boxComponent, type Component, fromCliBoxes, fromCliSpinners, hoist, manualClock, progress, registered, type Runtime, spinner, tableComponent, tasks } from 'flagstaff';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const OUT = join(root, 'apps', 'docs', 'content', 'docs', 'gallery.mdx');

const MODES = ['tty', 'pipe', 'ci', 'json', 'accessible'] as const;
type Mode = (typeof MODES)[number];
const ENV: Record<Mode, Record<string, string>> = { tty: {}, pipe: {}, ci: { CI: 'true' }, json: {}, accessible: { CLI_ACCESSIBLE: '1' } };

/** Frames to let pass before the component settles, so a spinner shows more than one. */
const FRAMES_SHOWN = 3;
const BOX_WIDTH = 34;
const SAMPLE_STYLES = 6;
/** Frames shown per style in the table — enough to read the shape, short enough to scan. */
const FRAMES_IN_TABLE = 8;

/** One mode's transcript for one component, escapes made visible exactly as `check` does. */
function render<S>(component: Component<S>, mode: Mode, running: S, done: S): string {
  const out: string[] = [];
  const err: string[] = [];
  const clock = manualClock();
  const rt: Runtime = { env: ENV[mode], isTTY: { stdout: mode === 'tty' }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, clock };
  const flag = hoist(component, rt, running, { json: mode === 'json' });
  for (let i = 0; i < FRAMES_SHOWN; i += 1) clock.tick(component.interval ?? 0);
  flag.lower(done);
  return [...out, ...err].join('').replaceAll('\u001B', '␛').replaceAll('\r', '␍').replaceAll('\n', '⏎ ').trimEnd();
}

interface Sample<S> {
  title: string;
  component: Component<S>;
  running: S;
  done: S;
  /** Why this component's static projection is what it is, in one line. */
  note: string;
}

// One list, five state shapes: the cast is the list's, not the components'.
const SAMPLES: Sample<unknown>[] = [
  { title: 'spinner', component: spinner(), running: { text: 'building' }, done: { text: 'built', status: 'ok' }, note: 'the running glyph and the text, then the settled glyph — never a frame' },
  { title: 'progress', component: progress({ width: 12 }), running: { done: 12, total: 30, label: 'files' }, done: { done: 30, total: 30, label: 'files' }, note: 'the count and the percentage; a bar of blocks says nothing in a log' },
  {
    title: 'tasks',
    component: tasks(),
    running: { tasks: [{ title: 'install', status: 'ok' }, { title: 'build', status: 'running' }] },
    done: { tasks: [{ title: 'install', status: 'ok' }, { title: 'build', status: 'ok' }] },
    note: 'only what has settled, so a pipe is not told twice that a step is running',
  },
  { title: 'box', component: boxComponent({ width: BOX_WIDTH }), running: { text: 'starting', title: 'dev' }, done: { text: 'ready on :3000', title: 'dev' }, note: 'the title and the text; a border is noise a screen reader reads character by character' },
  {
    title: 'table',
    component: tableComponent({ head: ['host', 'tests'] }),
    running: { rows: [['ora', '99']] },
    done: { rows: [['ora', '99'], ['log-update', '99']] },
    note: 'one line per row of header-and-value pairs, parseable without knowing the drawing',
  },
];

function modesFor<S>(sample: Sample<S>): string {
  const rows = MODES.map((mode) => `| ${cell(mode)} | ${cell(render(sample.component, mode, sample.running, sample.done))} |`);
  const note = `${(sample.note[0] ?? '').toUpperCase()}${sample.note.slice(1)}.`;
  return [`### ${sample.title}`, '', note, '', '| mode | what it writes |', '| :-- | :-- |', ...rows].join('\n');
}

/** A pipe closes a table cell even inside a code span, and `line`'s frames contain one. */
const cell = (text: string): string => `\`${text}\``.replaceAll('|', String.raw`\|`);

/** Every spinner style the registry holds, with the projection each one falls back to. */
function spinnerTable(): string {
  const rows = [...registered().spinners.entries()].map(([name, def]) => `| ${cell(name)} | ${cell(def.static)} | ${def.frames.slice(0, FRAMES_IN_TABLE).map((f) => cell(f)).join(' ')} | ${def.interval} ms |`);
  return ['| style | static | frames | interval |', '| :-- | :-- | :-- | --: |', ...rows].join('\n');
}

/** Every border the registry holds, drawn. */
function borderGallery(): string {
  return [...registered().borders.keys()].map((name) => ['```text', `${name}`, box(`box('…', { border: '${name}' })`, { width: BOX_WIDTH, border: name }), '```'].join('\n')).join('\n\n');
}

// What the corpus adds is what it holds *minus* what is already registered: `dots` and
// `line` are cli-spinners' too, and counting them again would overstate by two.
const corpus = Object.keys(fromCliSpinners(cliSpinners as Record<string, { frames: string[]; interval?: number }>).spinners ?? {});
const shipped = new Set(registered().spinners.keys());
const added = corpus.filter((name) => !shipped.has(name));
const sampleStyles = added.slice(0, SAMPLE_STYLES);

export function gallery(): string {
  return `---
title: Gallery
description: Every component and every registered plugin, rendered by running them — the static projection beside the animation, in all five modes.
---

Generated by \`npm run gallery:page\` from what flagstaff has registered. Do not edit by hand.

Every cell on this page is produced by **running** the component, through the same
\`hoist()\` a program uses and the same code path as \`flagstaff check\` — not by describing
it. Escapes are shown as \`␛\`, carriage returns as \`␍\` and newlines as \`⏎\`, so what a
terminal would swallow is visible.

## The five modes

One component, five answers. The \`tty\` row is the animation; every other row is the
**static projection**, and it is the artifact — what a pipe, a CI log, an agent and a
screen reader all read. Notice that no other row contains an escape sequence.

${SAMPLES.map((s) => modesFor(s)).join('\n\n')}

## Spinner styles

What the registry holds right now. \`static\` is what every mode but \`tty\` prints; a style
without one is refused at \`register()\`.

${spinnerTable()}

Two, because two is what the package ships. The corpus everyone already has is one line
away and is **not** bundled — \`fromCliSpinners(cliSpinners)\` adds ${added.length} more
(${sampleStyles.map((n) => `\`${n}\``).join(', ')}, …), each with \`…\` as its static
projection unless you say otherwise:

\`\`\`js
import cliSpinners from 'cli-spinners';
import { fromCliSpinners } from 'flagstaff/import';
import { register } from 'flagstaff/plugin';

register(fromCliSpinners(cliSpinners));
\`\`\`

## Borders

Drawn by \`box()\`, from the same registry. \`fromCliBoxes(cliBoxes)\` adds the rest of that
corpus the same way.

${borderGallery()}

## Writing one of your own

A plugin is one plain object, validated against [\`schema.json\`](https://github.com/ofri-peretz/burgee/blob/main/packages/flagstaff/src/schema.json) — the same file that ships in the tarball:

\`\`\`js
export default {
  name: 'pulse',
  contract: 1,
  spinners: {
    pulse: { frames: ['◜', '◝', '◞', '◟'], interval: 90, static: '…' },
  },
};
\`\`\`

\`\`\`bash
npx flagstaff check ./pulse.mjs
\`\`\`

\`check\` prints exactly the table at the top of this page for whatever you wrote, and exits
1 with the code and a fix if the schema refuses it. Leave the \`static\` off and it says so:

\`\`\`text
E_NO_STATIC_PROJECTION: pulse has no static projection
  fix: give it a \`static\`: the text a pipe, an agent or a screen reader gets instead of the animation
\`\`\`
`;
}

// Written only when run as a script, so `gallery-page.test.ts` can compare the committed
// page against a fresh render without the import writing one.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, gallery());
  process.stdout.write(`wrote ${OUT}\n`);
}
