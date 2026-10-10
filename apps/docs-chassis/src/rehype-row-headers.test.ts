/**
 * Tables a screen reader can announce. Lighthouse flagged axe `td-has-header` on every site in
 * the family: GFM writes a row-labelled table (`| | passing | rate |`) as plain `<td>` labels
 * under an empty `<th>`, and a three-column table whose last header is blank leaves that
 * column unnamed. The plugin owns the first case; the content check owns the second, which no
 * plugin can fix because only the author knows the column's name.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { promoteRowHeaders, rehypeRowHeaders } from './rehype-row-headers.mjs';
import sourceConfig from './source-config.mjs';

interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

const text = (value: string): Node => ({ type: 'text', value });
const cell = (tagName: 'th' | 'td', value: string): Node => ({ type: 'element', tagName, properties: {}, children: value === '' ? [] : [text(value)] });
const row = (...cells: Node[]): Node => ({ type: 'element', tagName: 'tr', properties: {}, children: [text('\n'), ...cells] });
const table = (head: string[], ...body: string[][]): Node => ({
  type: 'element',
  tagName: 'table',
  properties: {},
  children: [
    { type: 'element', tagName: 'thead', properties: {}, children: [row(...head.map((value) => cell('th', value)))] },
    { type: 'element', tagName: 'tbody', properties: {}, children: body.map((values) => row(...values.map((value) => cell('td', value)))) },
  ],
});

/** Each row as `tag[scope]:text`. */
function shape(node: Node): string[][] {
  const rows: string[][] = [];
  const walk = (current: Node): void => {
    if (current.tagName === 'tr') {
      rows.push((current.children ?? []).filter((child) => child.type === 'element').map((child) => `${child.tagName}${child.properties?.['scope'] === undefined ? '' : `[${String(child.properties['scope'])}]`}:${child.children?.[0]?.value ?? ''}`));
      return;
    }
    for (const child of current.children ?? []) walk(child);
  };
  walk(node);
  return rows;
}

describe('rehypeRowHeaders', () => {
  it('reads an empty top-left cell as a row-labelled table', () => {
    const node = table(['', 'passing', 'rate'], ['roundel/chalk', '59 / 59', '100.0%'], ['chalk itself', '59 / 59', '100.0%']);
    expect(promoteRowHeaders(node)).toBe(true);
    expect(shape(node)).toEqual([
      ['td:', 'th:passing', 'th:rate'],
      ['th[row]:roundel/chalk', 'td:59 / 59', 'td:100.0%'],
      ['th[row]:chalk itself', 'td:59 / 59', 'td:100.0%'],
    ]);
  });

  it('leaves a table whose corner names its column exactly as written', () => {
    const node = table(['option', 'default', 'meaning'], ['hard', 'false', 'break a long word']);
    const before = structuredClone(node);
    expect(promoteRowHeaders(node)).toBe(false);
    expect(node).toEqual(before);
  });

  it('counts whitespace as empty and finds tables at any depth', () => {
    const nested = table([' ', 'a', 'b'], ['x', '1', '2']);
    const corner = nested.children?.[0]?.children?.[0]?.children?.[1];
    corner?.children?.push(text('  '));
    const tree: Node = { type: 'root', children: [{ type: 'element', tagName: 'div', properties: {}, children: [nested] }] };
    rehypeRowHeaders()(tree);
    expect(shape(tree)[1]?.[0]).toBe('th[row]:x');
  });

  it('is in the MDX pipeline every docs app compiles with', () => {
    expect(sourceConfig.mdxOptions).toMatchObject({ rehypePlugins: [rehypeRowHeaders] });
  });
});

const APPS_DIR = fileURLToPath(new URL('../../', import.meta.url));

/** Every `.md` / `.mdx` under each app's `content/`. */
function contentFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.mdx?$/u.test(entry)) out.push(path);
    }
  };
  for (const app of readdirSync(APPS_DIR)) {
    const content = join(APPS_DIR, app, 'content');
    if (statSync(join(APPS_DIR, app)).isDirectory() && readdirSync(join(APPS_DIR, app)).includes('content')) walk(content);
  }
  return out;
}

/** A GFM delimiter row: `| :-- | --: |`. */
const DELIMITER = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/u;

/** The cells of one `| a | b |` row, escaped pipes kept inside their cell. */
const cellsOf = (line: string): string[] => line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split(/(?<!\\)\|/u);

describe('docs content tables', () => {
  it('reads every app’s content', () => {
    expect(contentFiles().length).toBeGreaterThan(100);
  });

  // axe applies td-has-header to tables of three columns or more; a two-column key/value
  // table is read by its row headers, which the plugin above gives it.
  it('names every column after the first in a table of three columns or more', () => {
    const unnamed: string[] = [];
    for (const file of contentFiles()) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const header = lines[index - 1];
        if (index === 0 || header === undefined || !DELIMITER.test(line) || !header.trim().startsWith('|')) return;
        const cells = cellsOf(header);
        if (cells.length >= 3 && cells.slice(1).some((value) => value.trim() === '')) unnamed.push(`${file.slice(APPS_DIR.length)}:${index}: ${header.trim()}`);
      });
    }
    expect(unnamed).toEqual([]);
  });
});
