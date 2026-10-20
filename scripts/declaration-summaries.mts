#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * declaration-summaries.mts — a published declaration keeps what an editor shows a caller, and
 * drops the design notes (D-20261012-declarations-carry-summaries, intent
 * `declaration-summaries`).
 *
 * Kept, of each JSDoc block: its first paragraph, every fenced code block (an example is not
 * prose), and the `@param`, `@returns`, `@throws`, `@example`, `@deprecated`, `@default` and
 * `@see` tags, each whole. Dropped: every later paragraph of prose, every other tag, and every
 * comment that is not JSDoc. Three kinds of
 * comment are not prose and stay byte for byte: a `///` directive, a `// @ts-…` pragma (it
 * changes what a consumer's compiler reports), and a licence notice (`Copyright`, `@license`,
 * `/*!`), which the MIT terms of the vendored declarations require to travel with them.
 *
 * Comments are located by TypeScript's own scanner (`getLeadingCommentRanges` /
 * `getTrailingCommentRanges` at every token of the parsed file), never by a regex over the
 * text, so a `*\/` inside a string literal type is never read as the end of a comment.
 *
 * Plain Node (type stripping). `strip-comments.mjs` calls {@link summariseDeclaration} on every
 * `.d.ts`, `.d.mts` and `.d.cts` it walks; run directly, this measures what the rule saves:
 *
 *   node scripts/declaration-summaries.mts --measure [packages/<name> …]
 *
 * For each package it packs the built tree as it is and a copy with the rule applied, and
 * prints both, gzipped and unpacked (spec R1).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

import ts from 'typescript';

/** The block tags an editor renders structurally; every other tag is dropped with the prose. */
export const KEPT_TAGS: readonly string[] = ['param', 'returns', 'throws', 'example', 'deprecated', 'default', 'see'];

/** A declaration file, by the three extensions tsc writes one under. */
export const DECLARATION = /\.d\.[cm]?ts$/;

/** A comment that is not prose: a directive, a compiler pragma, or a licence notice. */
const KEEP_WHOLE = /^\/\/\/|^\/\/\s*@ts-|^\/\*\s*@ts-|^\/\*!|copyright|@license/i;

const FENCE = /^\s*```/;
const TAG = /^@([A-Za-z]+)/;

const OPEN = '/**'.length;
const CLOSE = '*/'.length;
const PERCENT = 100;

/** The text lines of a `/** … *\/` block, without the delimiters or each line's leading `*`. */
function bodyLines(block: string): string[] {
  return block
    .slice(OPEN, -CLOSE)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\* ?/, '').trimEnd());
}

/** Drops the blank lines a tag's section ends with; it always starts with the tag's own line. */
function trimBlank(lines: readonly string[]): string[] {
  const out = [...lines];
  while (out.at(-1) === '') out.pop();
  return out;
}

/** A run of lines before the first block tag: a paragraph of prose, or a fenced code block. */
interface Unit {
  code: boolean;
  lines: string[];
}

interface Sections {
  /** What comes before the first block tag, in order. */
  lead: Unit[];
  /** Each block tag with the lines it carries, in order. */
  tags: { name: string; lines: string[] }[];
}

/**
 * One line before the first tag, added to the lead; returns the unit the next line continues.
 * Lines are already trimmed at the end, so a blank line is `''`.
 */
function leadLine(lead: Unit[], unit: Unit | undefined, line: string, fenced: boolean): Unit | undefined {
  if (fenced) {
    // Stryker disable next-line OptionalChaining: a fence in the lead always opened a code unit first; the chain only satisfies the type
    unit?.lines.push(line);
    return unit;
  }
  if (line === '') return undefined;
  if (FENCE.test(line) || unit === undefined || unit.code) {
    const next = { code: FENCE.test(line), lines: [line] };
    lead.push(next);
    return next;
  }
  unit.lines.push(line);
  return unit;
}

/**
 * A JSDoc block, read into its lead and its tags. A paragraph ends at a blank line, a tag starts
 * at a line beginning `@`, and a fenced block is a unit of its own; neither of the first two
 * applies inside a fence, whose blank lines and decorators belong to the code. A line after a
 * closing fence starts a new unit, because the unit it would continue is code.
 */
function sections(block: string): Sections {
  const out: Sections = { lead: [], tags: [] };
  let fenced = false;
  let unit: Unit | undefined;
  for (const line of bodyLines(block)) {
    const fence = FENCE.test(line);
    const tag = fenced ? null : TAG.exec(line.trimStart());
    if (tag !== null) out.tags.push({ name: tag[1]!, lines: [line] });
    else if (out.tags.length > 0) out.tags.at(-1)!.lines.push(line);
    else unit = leadLine(out.lead, unit, line, fenced);
    if (fence) fenced = !fenced;
  }
  return out;
}

/**
 * How many paragraphs of prose a JSDoc block carries before its tags — the lock reads this. A
 * fenced code block is not prose: it is the example a caller copies, and it is kept.
 */
export function proseParagraphs(block: string): number {
  return sections(block).lead.filter((u) => !u.code).length;
}

/**
 * One JSDoc block cut to its summary: the first paragraph, every fenced code block, and the kept
 * tags. The block comes back byte for byte when nothing is dropped, and `undefined` when nothing
 * is left.
 */
export function summariseBlock(block: string, indent = ''): string | undefined {
  const { lead, tags } = sections(block);
  const kept = tags.filter((t) => KEPT_TAGS.includes(t.name));
  const first = lead.find((u) => !u.code);
  if (lead.filter((u) => !u.code).length <= 1 && kept.length === tags.length) return block;
  const lines = [...lead.filter((u) => u.code || u === first).flatMap((u) => u.lines), ...kept.flatMap((t) => trimBlank(t.lines))];
  if (lines.length === 0) return undefined;
  return ['/**', ...lines.map((line) => (line === '' ? ' *' : ` * ${line}`)), ' */'].join(`\n${indent}`);
}

/**
 * Every comment in a declaration file, located by the scanner at each token, in source order.
 * The name only picks the script kind, and a declaration parses the same as any TypeScript.
 */
function commentRanges(text: string): ts.CommentRange[] {
  // Stryker disable next-line StringLiteral: see above — the file name changes nothing a declaration parses to
  const source = ts.createSourceFile('x.d.ts', text, ts.ScriptTarget.Latest);
  const found = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node): void => {
    for (const range of [...(ts.getLeadingCommentRanges(text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(text, node.end) ?? [])]) found.set(range.pos, range);
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return [...found.values()].toSorted((a, b) => a.pos - b.pos);
}

/**
 * A declaration file with every JSDoc block summarised and every other prose comment removed.
 * A comment alone on its line takes its line with it; one after code takes the spaces before it.
 */
export function summariseDeclaration(text: string): string {
  let out = '';
  let at = 0;
  for (const { pos, end } of commentRanges(text)) {
    const comment = text.slice(pos, end);
    if (KEEP_WHOLE.test(comment)) continue;
    const lineStart = text.lastIndexOf('\n', pos) + 1;
    const indent = text.slice(lineStart, pos);
    const alone = indent.trim() === '';
    const summary = comment.startsWith('/**') ? summariseBlock(comment, indent) : undefined;
    if (summary !== undefined) {
      out += text.slice(at, pos) + summary;
      at = end;
      continue;
    }
    const after = /^[ \t]*\r?\n/.exec(text.slice(end))?.[0];
    if (alone && after !== undefined) {
      out += text.slice(at, lineStart);
      at = end + after.length;
    } else {
      out += text.slice(at, pos).replace(/[ \t]+$/, '');
      at = end;
    }
  }
  return out + text.slice(at);
}

/** Every JSDoc block in a declaration file that carries more than one paragraph of prose. */
export function multiParagraphBlocks(text: string): string[] {
  return commentRanges(text)
    .map(({ pos, end }) => text.slice(pos, end))
    .filter((comment) => comment.startsWith('/**') && !KEEP_WHOLE.test(comment) && proseParagraphs(comment) > 1);
}

/** What `npm pack` reports for a tree: the gzipped tarball and the unpacked bytes. */
export interface PackSize {
  size: number;
  unpackedSize: number;
}

/** `npm pack --dry-run --json` in a directory, without assuming a POSIX shell (see `pack-list-lock.test.ts`). */
function packOf(dir: string): PackSize & { files: string[] } {
  // Stryker disable next-line StringLiteral: without the launcher's npm the bare `npm` below runs instead, and the pack is the same
  const cli = process.env['npm_execpath'];
  const args = ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const io = { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] } as const;
  // Stryker disable next-line ConditionalExpression,MethodExpression,BooleanLiteral,EqualityOperator,StringLiteral,ArrayDeclaration: which npm binary runs is per platform and per launcher; either way the pack is the same, and one run reaches one branch
  const out = cli?.endsWith('.js') === true ? execFileSync(process.execPath, [cli, ...args], io) : execFileSync('npm', args, { ...io, shell: process.platform === 'win32' });
  const [pack] = JSON.parse(out) as { size: number; unpackedSize: number; files: { path: string }[] }[];
  return { size: pack!.size, unpackedSize: pack!.unpackedSize, files: pack!.files.map((f) => f.path) };
}

/**
 * A package's pack as built, and as it would be with the rule applied: the packed files are
 * copied to a scratch directory, every declaration among them summarised, and packed again.
 * The built tree is read, never written.
 */
export function measurePackage(dir: string): { before: PackSize; after: PackSize } {
  const before = packOf(dir);
  // Stryker disable next-line StringLiteral: the prefix names the directory for a person; nothing reads it
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'declaration-summaries-'));
  try {
    for (const file of before.files) {
      const to = path.join(scratch, file);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      fs.writeFileSync(to, DECLARATION.test(file) ? summariseDeclaration(text) : text);
    }
    const after = packOf(scratch);
    return { before: { size: before.size, unpackedSize: before.unpackedSize }, after: { size: after.size, unpackedSize: after.unpackedSize } };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** A change as a signed percentage to one place. */
const pct = (from: number, to: number): string => `${(((to - from) / from) * PERCENT).toFixed(1)}%`;

/** One line of the measurement: a package, its two packs, and the change as a percentage. */
export function measureLine(name: string, { before, after }: { before: PackSize; after: PackSize }): string {
  return `${name}: gzipped ${String(before.size)} -> ${String(after.size)} (${pct(before.size, after.size)}), unpacked ${String(before.unpackedSize)} -> ${String(after.unpackedSize)} (${pct(before.unpackedSize, after.unpackedSize)})`;
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (isMain && process.argv.includes('--measure')) {
  const named = process.argv.slice(2).filter((arg) => arg !== '--measure');
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
  const dirs =
    named.length > 0
      ? named.map((dir) => path.resolve(dir))
      : fs
          .readdirSync(path.join(root, 'packages'))
          .map((name) => path.join(root, 'packages', name))
          .filter((dir) => fs.existsSync(path.join(dir, 'dist')) && (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { private?: boolean }).private !== true);
  for (const dir of dirs) process.stdout.write(`${measureLine(path.basename(dir), measurePackage(dir))}\n`);
}
