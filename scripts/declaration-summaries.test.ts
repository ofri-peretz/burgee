/**
 * declaration-summaries R1, R2 — a published declaration keeps each JSDoc block's first
 * paragraph, its fenced examples and the tags an editor renders, and drops the rest of the prose
 * (D-20261012-declarations-carry-summaries). R1 measures what that saves on a packed tree
 * before anything is cut; R2 is the rule itself, run by every package's build through
 * `strip-comments.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fc from 'fast-check';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

import { KEPT_TAGS, measureLine, measurePackage, multiParagraphBlocks, proseParagraphs, summariseBlock, summariseDeclaration } from './declaration-summaries.mts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), 'declaration-summaries-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** `npm pack` twice over a small tree. */
const PACK_TIMEOUT_MS = 60_000;

/** A declaration with one block of three paragraphs, a kept tag and a dropped one. */
const THREE_PARAGRAPHS = [
  '/**',
  ' * Greets someone by name.',
  ' *',
  ' * The design note: why greeting is a function and not a method, at length.',
  ' *',
  ' * And a third paragraph on what was rejected.',
  ' *',
  ' * @param name - who to greet',
  ' * @remarks an essay in a tag',
  ' */',
  'export declare function greet(name: string): string;',
  '',
].join('\n');

const SUMMARISED = ['/**', ' * Greets someone by name.', ' * @param name - who to greet', ' */', 'export declare function greet(name: string): string;', ''].join('\n');

/** The declaration with every comment removed, as the compiler prints it: what a consumer's types are. */
const typesOf = (text: string): string => ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile('x.d.ts', text, ts.ScriptTarget.Latest, true));

describe('R2 — the rule: the first paragraph and the rendered tags stay', () => {
  it('keeps paragraph one and @param, and drops paragraphs two and three and @remarks', () => {
    expect(summariseDeclaration(THREE_PARAGRAPHS)).toBe(SUMMARISED);
    expect(proseParagraphs(THREE_PARAGRAPHS.slice(0, THREE_PARAGRAPHS.indexOf('*/') + 2))).toBe(3);
  });

  it('keeps exactly the tags the decision names', () => {
    expect(KEPT_TAGS).toEqual(['param', 'returns', 'throws', 'example', 'deprecated', 'default', 'see']);
    const block = `/**\n * One.\n *\n * Two.\n${KEPT_TAGS.map((tag) => ` * @${tag} x`).join('\n')}\n * @internal\n */`;
    expect(summariseBlock(block)).toBe(`/**\n * One.\n${KEPT_TAGS.map((tag) => ` * @${tag} x`).join('\n')}\n */`);
  });

  it('returns a block that is already a summary byte for byte, single-line or not', () => {
    for (const block of ['/** One line. */', '/**\n *   Indented,\n *   over two lines.\n * @returns it\n */']) expect(summariseBlock(block)).toBe(block);
  });

  it('keeps a tag whole, blank lines and all, and reads a fenced example as code', () => {
    const block = ['/**', ' * Runs.', ' *', ' * Why it runs.', ' * @example', ' * ```ts', ' * @decorator()', ' *', ' * run();', ' * ```', ' *', ' */'].join('\n');
    expect(summariseBlock(block)).toBe(['/**', ' * Runs.', ' * @example', ' * ```ts', ' * @decorator()', ' *', ' * run();', ' * ```', ' */'].join('\n'));
  });

  it('a fenced block in the lead is code, not prose: it is kept, and a blank line inside it starts nothing', () => {
    expect(proseParagraphs('/**\n * Use it:\n * ```\n * a\n *\n * b\n * ```\n */')).toBe(1);
    const block = ['/**', ' * Builds a brand.', ' *', ' * Why a brand is a declaration.', ' *', ' * ```js', ' * const brand = defineBurgee({', ' *', ' * });', ' * ```', ' * After the example.', ' */'].join('\n');
    expect(proseParagraphs(block)).toBe(3);
    expect(summariseBlock(block)).toBe(['/**', ' * Builds a brand.', ' * ```js', ' * const brand = defineBurgee({', ' *', ' * });', ' * ```', ' */'].join('\n'));
  });

  it('removes a block with nothing left, and the line it stood on', () => {
    expect(summariseDeclaration('/** @internal */\nexport declare const a: 1;\n')).toBe('export declare const a: 1;\n');
    expect(summariseBlock('/**\n * @remarks only\n */')).toBeUndefined();
  });

  it('keeps the first paragraph alone when the block has no tags, at the block’s own indent', () => {
    const text = 'export interface A {\n    /**\n     * The size.\n     *\n     * Why it is a number.\n     */\n    size: number;\n}\n';
    expect(summariseDeclaration(text)).toBe('export interface A {\n    /**\n     * The size.\n     */\n    size: number;\n}\n');
  });

  it('drops a comment that is not JSDoc: alone on its line with the line, after code with its spaces', () => {
    expect(summariseDeclaration('  // a note\nexport declare const a: 1; /* why */\nexport declare const b: 2;  // trailing\n')).toBe('export declare const a: 1;\nexport declare const b: 2;\n');
    expect(summariseDeclaration('export declare const a: 1;\n// last')).toBe('export declare const a: 1;\n');
    expect(summariseDeclaration('/* lead */ export declare const a: 1;\n')).toBe(' export declare const a: 1;\n');
  });

  it('a `\\r\\n` file loses the whole line, carriage return included', () => {
    expect(summariseDeclaration('// a note\r\nexport declare const a: 1;\r\n')).toBe('export declare const a: 1;\r\n');
  });

  it('keeps a directive, a compiler pragma and a licence notice byte for byte', () => {
    const text = [
      '/// <reference types="node" />',
      '/*! a notice */',
      '/**',
      ' * Copyright (c) 2026 Someone',
      ' *',
      ' * Licensed under the MIT License.',
      ' */',
      '/**',
      ' * @license MIT',
      ' *',
      ' * Second.',
      ' */',
      '// @ts-ignore',
      '/* @ts-expect-error */',
      'export declare const a: 1;',
      '',
    ].join('\n');
    expect(summariseDeclaration(text)).toBe(text);
  });

  it('never reads `*/` or `/*` inside a string literal type as a comment', () => {
    const text = "export type A = '/* not a comment */' | \"*/\" | `/** ${string} */`;\n";
    expect(summariseDeclaration(text)).toBe(text);
    expect(multiParagraphBlocks(text)).toEqual([]);
  });

  it('reaches a block with no declaration after it, before a closing brace', () => {
    const text = 'export interface A {\n    a: 1;\n    /**\n     * Dangling.\n     *\n     * Second.\n     */\n}\n';
    expect(multiParagraphBlocks(text)).toHaveLength(1);
    expect(summariseDeclaration(text)).toBe('export interface A {\n    a: 1;\n    /**\n     * Dangling.\n     */\n}\n');
  });

  /**
   * The property the rule must hold on any input: the types a consumer compiles are unchanged,
   * no block keeps a second paragraph, and a second pass changes nothing.
   */
  it('for any block: the types are unchanged, one paragraph and every example are left, and it is idempotent', () => {
    const word = fc.stringMatching(/^[a-z]{1,6}$/);
    const line = fc.array(word, { minLength: 1, maxLength: 4 }).map((w) => w.join(' '));
    const prose = fc.array(line, { minLength: 1, maxLength: 3 });
    const code = fc.tuple(line, line).map(([a, b]) => ['```', a, '', `@${b}`, '```']);
    const paragraph = fc.oneof(prose, code);
    const tag = fc.tuple(fc.constantFrom(...KEPT_TAGS, 'remarks', 'internal', 'since'), line).map(([name, text]) => `@${name} ${text}`);
    const block = fc.tuple(fc.array(paragraph, { maxLength: 4 }), fc.array(tag, { maxLength: 3 })).map(([paragraphs, tags]) => {
      const body = [...paragraphs.map((p) => p.join('\n')).join('\n\n').split('\n'), ...tags];
      return `/**\n${body.map((l) => (l === '' ? ' *' : ` * ${l}`)).join('\n')}\n */`;
    });
    fc.assert(
      fc.property(block, fc.constantFrom('', '    '), (comment, indent) => {
        const text = `export interface I {\n${indent}${comment.split('\n').join(`\n${indent}`)}\n${indent}a: string;\n}\n`;
        const once = summariseDeclaration(text);
        expect(typesOf(once)).toBe(typesOf(text));
        expect(multiParagraphBlocks(once)).toEqual([]);
        expect(summariseDeclaration(once)).toBe(once);
        expect(once.split('```').length).toBe(text.split('```').length);
      }),
    );
  });

  it('runs in the build: strip-comments.mjs summarises every declaration it walks, nested ones too', () => {
    const dist = join(scratch, 'build-dist');
    mkdirSync(join(dist, 'nested'), { recursive: true });
    for (const file of ['index.d.ts', 'nested/cjs.d.cts', 'nested/esm.d.mts']) writeFileSync(join(dist, file), THREE_PARAGRAPHS);
    execFileSync(process.execPath, [join(root, 'scripts/strip-comments.mjs'), dist], { stdio: 'ignore' });
    for (const file of ['index.d.ts', 'nested/cjs.d.cts', 'nested/esm.d.mts']) expect(readFileSync(join(dist, file), 'utf8')).toBe(SUMMARISED);
  });
});

describe('R1 — measured before cut, from a copy of the built tree', () => {
  it(
    'packs the tree as built and with the rule applied, and the difference is what the rule cut',
    () => {
      const pkg = join(scratch, 'fixture-package');
      mkdirSync(join(pkg, 'dist'), { recursive: true });
      writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', files: ['dist'] }));
      writeFileSync(join(pkg, 'dist/index.d.ts'), THREE_PARAGRAPHS);
      writeFileSync(join(pkg, 'dist/index.js'), 'export const greet = (name) => name;\n');

      const measured = measurePackage(pkg);
      expect(measured.before.unpackedSize - measured.after.unpackedSize).toBe(Buffer.byteLength(THREE_PARAGRAPHS) - Buffer.byteLength(SUMMARISED));
      expect(measured.after.size).toBeLessThan(measured.before.size);
      // The built tree is read, never written.
      expect(readFileSync(join(pkg, 'dist/index.d.ts'), 'utf8')).toBe(THREE_PARAGRAPHS);
    },
    PACK_TIMEOUT_MS,
  );

  it('prints both packs and the change', () => {
    expect(measureLine('burgee', { before: { size: 1000, unpackedSize: 4000 }, after: { size: 900, unpackedSize: 3000 } })).toBe('burgee: gzipped 1000 -> 900 (-10.0%), unpacked 4000 -> 3000 (-25.0%)');
  });
});
