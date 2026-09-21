/**
 * `burgee/meow` — the help block, the version string, the package it reads them from, and
 * the process title it sets from that package.
 *
 * All four are one concern: what the CLI says about itself before it does anything.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { host } from '../runtime.js';

import { type Options } from './types.js';

/** `indent-string` for one level, which is all meow's help ever asks for. */
const indent = (text: string, spaces: number): string =>
  text.replace(/^(?!\s*$)/gmu, ' '.repeat(spaces));

/** The nearest `package.json` above the caller's module, which is what `importMeta` is for. */

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

/**
 * meow's help block.
 *
 * Indented by `helpIndent` (2 by default) — but only when there is more than one line to
 * indent, which is why `{description: false, help: 'single line'}` comes back flush. The
 * suite states both shapes and they disagree about the indent, not about the text.
 */

/**
 * meow's help block.
 *
 * Indented by `helpIndent` (2 by default) — but only when there is more than one line to
 * indent, which is why `{description: false, help: 'single line'}` comes back flush. The
 * suite states both shapes and they disagree about the indent, not about the text.
 */
export function buildHelp(options: Options, pkg: Record<string, unknown>): string {
  const description = options.description === false ? '' : (options.description ?? (pkg['description'] as string | undefined) ?? '');
  const body = options.help === false ? '' : stripIndent(options.help ?? '');
  const parts = [description, body].filter((p) => p !== '');
  if (parts.length === 0) return '';
  const text = parts.join('\n\n');
  const width = options.helpIndent ?? 2;
  return `\n${text.includes('\n') ? indent(text, width) : text}\n`;
}

/** `common-tags`' `stripIndent`, for the template literals meow's callers write help in. */

/** `common-tags`' `stripIndent`, for the template literals meow's callers write help in. */
export function stripIndent(text: string): string {
  const lines = text.split('\n');
  const widths = lines.filter((l) => l.trim() !== '').map((l) => (/^(\s*)/u.exec(l)?.[1] ?? '').length);
  const smallest = widths.length === 0 ? 0 : Math.min(...widths);
  return lines
    .map((l) => l.slice(smallest))
    .join('\n')
    .trim();
}

/** Every flag name a caller may write, and the canonical name each maps to. */

/**
 * The half of `normalize-package-data` meow's callers can see.
 *
 * `bin` as a string becomes `{ [name]: path }` — the suite reads `cli.pkg.bin['browser-sync']`
 * — and an absent `version` becomes `''`. A copy, because `pkg normalization is lazy` asserts
 * the object the caller passed in is untouched.
 */
export function normalizePackage(pkg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...pkg };
  const name = typeof out['name'] === 'string' ? (out['name'] as string).replace(/^@[^/]+\//u, '') : undefined;
  if (typeof out['bin'] === 'string' && name !== undefined) out['bin'] = Object.fromEntries([[name, out['bin']]]);
  if (out['version'] === undefined) out['version'] = '';
  return out;
}

/** meow renames the process after the binary it is, which `ps` and a crash report both read. */

/** meow renames the process after the binary it is, which `ps` and a crash report both read. */
export function setProcessTitle(pkg: Record<string, unknown>): void {
  const bin = pkg['bin'];
  const first = typeof bin === 'object' && bin !== null ? Object.keys(bin)[0] : undefined;
  const name = typeof pkg['name'] === 'string' ? (pkg['name'] as string).replace(/^@[^/]+\//u, '') : undefined;
  const title = first ?? name;
  if (title !== undefined && title !== '') host.setTitle(title);
}

/** An own property under a key the caller chose — never the prototype setter. */
