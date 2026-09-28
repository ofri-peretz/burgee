/**
 * `burgee/meow` — the help block, the package it reads it from, and the process title it
 * sets from that package.
 *
 * All three are one concern: what the CLI says about itself before it does anything.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { host } from '../runtime.js';

import { type Settings } from './types.js';

/** The nearest `package.json` above the caller's module, which is what `importMeta` is for. */
export function readPackageUp(importMeta: ImportMeta | undefined): Record<string, unknown> {
  if (importMeta?.url === undefined) return {};
  let dir = dirname(fileURLToPath(importMeta.url));
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
    } catch {
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return {};
}

/** `trim-newlines`: leading and trailing `\r`/`\n` only — trailing spaces survive it. */
const trimNewlines = (text: string): string => text.replace(/^[\r\n]+|[\r\n]+$/gu, '');

/** `strip-indent`: the smallest indent of any line with content, removed from every line. */
function stripIndent(text: string): string {
  const indents = text.match(/^[ \t]*(?=\S)/gmu);
  if (indents === null) return text;
  const smallest = Math.min(...indents.map((i) => i.length));
  return smallest === 0 ? text : text.replace(new RegExp(`^[ \\t]{${smallest}}`, 'gmu'), '');
}

/** `redent`: `strip-indent`, then `indent-string`, which leaves whitespace-only lines alone. */
const redent = (text: string, spaces: number): string => stripIndent(text).replace(/^(?!\s*$)/gmu, ' '.repeat(spaces));

/**
 * meow's help block, built the way meow builds it — which is what makes it byte-exact.
 *
 * Trailing tabs are cut, newlines are trimmed from both ends, and a multi-line help is
 * redented to `helpIndent`; a single line comes back flush. The description goes in front,
 * redented as its own block when there is a help to sit above. **A whitespace-only last line
 * survives**: the template literal callers write ends `\n  \t`; the tab is cut, the two spaces
 * are not newlines so trimming keeps them, and redenting empties that line without removing
 * it. It is the blank line meow prints after the help — the one `spawn cli and show help
 * screen` asserts, and the one trimming the whole block used to lose.
 */
export function buildHelp(options: Settings, pkg: Record<string, unknown>): string {
  const width = options.helpIndent ?? 2;
  let help = '';
  if (typeof options.help === 'string' && options.help !== '') {
    help = trimNewlines(options.help.replace(/\t+\n*$/u, ''));
    if (help.includes('\n')) help = redent(help, width);
    help = `\n${help}`;
  }
  const description = 'description' in options ? options.description : ((pkg['description'] as string | undefined) ?? false);
  if (description !== false && description !== undefined && description !== '') {
    help = `${help === '' ? `\n${description}` : redent(`\n${description}\n`, width)}${help}`;
  }
  return `${help}\n`;
}

/**
 * The half of `normalize-package-data` meow's callers can see, done **in place and on first
 * read** — meow hands back a `pkg` getter that normalizes the caller's own object the first
 * time anyone asks. So `pkg normalization is lazy` sees the object untouched after `meow()`
 * returns and mutated after `cli.pkg` is read.
 *
 * `bin` as a string becomes `{ [name]: path }` — the suite reads `cli.pkg.bin['browser-sync']`
 * — and an absent `version` becomes `''`.
 */
export function normalizePackage(pkg: Record<string, unknown>): Record<string, unknown> {
  const name = typeof pkg['name'] === 'string' ? pkg['name'].replace(/^@[^/]+\//u, '') : undefined;
  if (typeof pkg['bin'] === 'string' && name !== undefined) pkg['bin'] = Object.fromEntries([[name, pkg['bin']]]);
  if (pkg['version'] === undefined) pkg['version'] = '';
  return pkg;
}

/**
 * meow renames the process after the binary it is, which `ps` and a crash report both read.
 * Read off the package as the caller gave it, before normalization: a string `bin` means the
 * unscoped name, an object `bin` its first key, and no `bin` the name as written.
 */
export function setProcessTitle(pkg: Record<string, unknown>): void {
  const name = typeof pkg['name'] === 'string' ? pkg['name'] : '';
  const bin = pkg['bin'];
  let title = name;
  if (typeof bin === 'string') title = name.replace(/^@[^/]+\//u, '');
  else if (typeof bin === 'object' && bin !== null) title = Object.keys(bin)[0] ?? name;
  if (title !== '') host.setTitle(title);
}
