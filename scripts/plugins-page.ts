/**
 * Generates `apps/docs/content/docs/plugins.mdx` — every layer's plugin surface, from the tree.
 *
 * Everything on the page that can be derived is: which packages host plugins and which keys each
 * reads (each `src/plugin.ts`'s exported `Plugin` type, read with the TypeScript parser), what a
 * key contributes (the published schema's own description), the command that checks a plugin
 * (each `package.json`'s `bin`), which incumbents a package replaces (the compat oracle's
 * `HOSTS`), the hook stages burgee offers (the schema), and the worked example (a committed file
 * every host's `check` accepts — `scripts/plugin-example-lock.test.ts`).
 *
 * The one hand-kept column is each incumbent's own extension point. It is data here rather than
 * prose on the page so it cannot be skipped: a host added to the oracle without a line below
 * stops this script, because a comparison that silently drops a row is the one a reader
 * should distrust.
 *
 * `--check` regenerates and compares, and runs in the required `Generated Pages` job.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6)
import { HOSTS } from '../packages/compat-oracle/src/hosts.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packages = join(root, 'packages');
const OUT = join(root, 'apps/docs/content/docs/plugins.mdx');
const EXAMPLE = 'examples/plugins/acme.mjs';

/**
 * What each incumbent offers for extension, as its own documentation describes it. Narrow on
 * purpose: "per call" and "per program" say where the extension lives, because a contribution
 * written once and shared across programs and layers is the difference being described, and
 * an incumbent that has a real extension point is named with it.
 */
const EXTENSION_POINTS: Record<string, string> = {
  commander: 'Lifecycle hooks on one program (`.hook(\'preAction\')`); no plugin shareable across programs — the plugin RFC, [#2505](https://github.com/tj/commander.js/issues/2505), is open',
  yargs: 'Middleware on one program (`.middleware()`), and commands loaded from modules (`.commandDir()`)',
  meow: 'None',
  cac: 'Events on one program (`cli.on()`)',
  citty: '`setup` and `cleanup` on each command',
  chalk: 'None — styles are code; there is no theme to register',
  ora: 'A custom spinner object, per instance (`spinner: { frames, interval }`)',
  'log-update': 'None',
  boxen: 'A custom border object, per call (`borderStyle`)',
  'cli-table3': 'Custom border characters, per table (`chars`)',
  'string-width': 'An option per call (`ambiguousIsNarrow`); no per-code-point override',
  'strip-ansi': 'None',
  'wrap-ansi': 'Options per call',
  'slice-ansi': 'None',
  'ansi-escapes': 'None',
  'terminal-link': 'A `fallback` function, per call',
  'term-img': 'A `fallback` function, per call',
  cosmiconfig: 'Custom `loaders` per file extension and `searchPlaces`, per explorer',
  lilconfig: 'Custom `loaders` per file extension, per call',
  dotenv: 'None',
  rc: 'A custom `parse` function, per call',
  clack: 'Custom prompts built on `@clack/core`',
  'inquirer-core': 'Custom prompts built with `createPrompt`',
  'signal-exit': 'None — it is the hook',
  'exit-hook': 'None — it is the hook',
  'restore-cursor': 'None',
  'cross-spawn': 'None',
};

/** The member names of a host's exported `Plugin` type. */
function pluginKeys(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== 'Plugin') continue;
    return statement.members.flatMap((m) => (m.name !== undefined && ts.isIdentifier(m.name) ? [m.name.text] : []));
  }
  return [];
}

interface Schema {
  properties: Record<string, { description?: string; $ref?: string; properties?: Record<string, unknown> }>;
  $defs: Record<string, { description?: string }>;
}
const schema = JSON.parse(readFileSync(join(packages, 'flagstaff/src/schema.json'), 'utf8')) as Schema;

/** A key's description: its own, or the definition it points at. */
function describe(key: string): string {
  const property = schema.properties[key];
  if (property === undefined) throw new Error(`schema.json does not describe \`${key}\` — run scripts/schema-sync.mjs after describing it`);
  const own = property.description ?? (property.$ref === undefined ? undefined : schema.$defs[property.$ref.split('/').pop() ?? '']?.description);
  if (own === undefined) throw new Error(`schema.json describes \`${key}\` with no description`);
  return own;
}

const ENVELOPE = new Set(['name', 'contract', 'enforce']);
const hosts = readdirSync(packages, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(packages, e.name, 'src/plugin.ts')))
  .map((e) => {
    const manifest = JSON.parse(readFileSync(join(packages, e.name, 'package.json'), 'utf8')) as { bin?: Record<string, string> };
    const incumbents = HOSTS.filter((h) => h.status !== 'rejected' && h.target.split('/')[0] === e.name).map((h) => h.name);
    return {
      name: e.name,
      bin: Object.keys(manifest.bin ?? {})[0] ?? e.name,
      keys: pluginKeys(join(packages, e.name, 'src/plugin.ts')).filter((k) => !ENVELOPE.has(k)),
      incumbents,
    };
  })
  .toSorted((a, b) => a.name.localeCompare(b.name));

const unstated = hosts.flatMap((h) => h.incumbents).filter((name) => EXTENSION_POINTS[name] === undefined);
if (unstated.length > 0) throw new Error(`no extension point stated for ${unstated.join(', ')} — add each to EXTENSION_POINTS in scripts/plugins-page.ts`);

const cell = (s: string): string => s.replaceAll('|', '\\|').replaceAll('\n', ' ');
const rows = hosts.flatMap((h) =>
  h.keys.map((key, i) => {
    const incumbents = i === 0 ? h.incumbents.map((n) => `**${n}** — ${EXTENSION_POINTS[n] ?? ''}`).join('<br />') : '';
    const check = i === 0 ? `\`npx ${h.bin} check ./plugin.mjs\`` : '';
    return `| ${i === 0 ? `**${h.name}**` : ''} | \`${key}\` | ${cell(describe(key))} | ${check} | ${incumbents} |`;
  }),
);

const stages = Object.keys(schema.properties['hooks']?.properties ?? {});
const example = readFileSync(join(root, EXAMPLE), 'utf8').trimEnd();

const page = `---
title: Plugins
description: Every layer takes plugins the same way — a plain object, validated against one published schema, checked by the package's own command before it ships. One object can extend all nine.
---

Generated by \`npm run plugins:page\` from the packages themselves. Do not edit by hand.

Every package in the family takes plugins, and all ${hosts.length} take them the same way. A plugin
is a plain object. Each package validates it against **one published schema** — the same
\`schema.json\` ships in every package — and each package has a \`check\` command that shows what
a plugin contributes, or refuses it with a code and the fix, before it ships.

Each package reads its own key and ignores the others, so **one object can extend any subset
of the family that is installed**, including all of it.

## One object, ${hosts.length} layers

A company's CLI conventions, in one file: brand colours, a spinner, a terminal quirk, a
terminal capability, a config source, where its tools live, what to flush on exit, a prompt
of its own, and a command every one of its CLIs gets.

\`\`\`js title="${EXAMPLE}"
${example}
\`\`\`

This is a committed file, not an illustration: \`scripts/plugin-example-lock.test.ts\` runs all
${hosts.length} \`check\` commands against it, and the published schema over it, on every CI run.

## What each layer takes

| Package | Key | What a plugin contributes | Check it | What the incumbent offers |
| :--- | :--- | :--- | :--- | :--- |
${rows.join('\n')}

The schema for every key above ships as \`<package>/schema.json\`. An editor, a validator or a
model can read it without running anything.

## What a plugin cannot do yet

- **burgee's hooks stop at help and config.** A plugin can act at
  ${stages.map((s) => `\`${s}\``).join(', ')} — rewriting argv before a command is resolved,
  around the run, and once as the program leaves — but not inside help rendering and not in
  config resolution. Contributing commands has no such limit.
- **flagstaff's built-in components are not contributions.** A plugin adds spinners, borders
  and components of its own; it cannot replace \`progress\`, \`box\` or \`table\`.
- **The schema cannot say "function".** \`static\`, \`run\`, \`read\` and \`handler\` are required
  and described; that each is a function is checked by the package, not by the schema.
- **Whether a model writes a working plugin in one turn is unmeasured.** Each package has an
  eval case that asks exactly that, proven to tell a working plugin from a broken one; none
  has run against a model yet.
`;

/**
 * The README's block: the same rows, keys and commands only, between markers so the front page
 * cannot name a key a package no longer reads.
 */
const README = join(root, 'README.md');
const START = '<!-- plugins:start -->';
const END = '<!-- plugins:end -->';
const block = [
  START,
  '',
  '| Package | A plugin adds | Check it |',
  '| :--- | :--- | :--- |',
  ...hosts.map((h) => `| [\`${h.name}\`](./packages/${h.name}/) | ${h.keys.map((k) => `\`${k}\``).join(', ')} | \`npx ${h.bin} check ./plugin.mjs\` |`),
  '',
  END,
].join('\n');
const readme = readFileSync(README, 'utf8');
const at = readme.indexOf(START);
const end = readme.indexOf(END);
if (at === -1 || end === -1) throw new Error(`README.md has no ${START} … ${END} block`);
const withBlock = `${readme.slice(0, at)}${block}${readme.slice(end + END.length)}`;

const targets: [string, string, string][] = [
  [OUT, existsSync(OUT) ? readFileSync(OUT, 'utf8') : '', page],
  [README, readme, withBlock],
];
if (process.argv.includes('--check')) {
  const stale = targets.filter(([, committed, want]) => committed !== want).map(([file]) => file);
  for (const file of stale) process.stderr.write(`✖ ${file} is not what the packages generate — run \`npm run plugins:page\`\n`);
  if (stale.length > 0) process.exit(1);
  process.stdout.write('✓ plugins.mdx and the README block match the packages\n');
} else {
  for (const [file, , want] of targets) writeFileSync(file, want);
  process.stdout.write(`wrote ${OUT} and the README block\n`);
}
