/**
 * Tables that fold into cards on a narrow screen. The plugin labels every body cell with its
 * column's header and keeps the table a table for assistive tech; `global.css` does the folding.
 * Both halves are checked, because either alone renders a wide screen unchanged and a phone
 * broken.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { promoteRowHeaders } from './rehype-row-headers.mjs';
import { stackTable } from './rehype-table-stack.mjs';
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
const els = (node: Node | undefined, tag: string): Node[] => (node?.children ?? []).filter((c) => c.tagName === tag);

describe('rehypeTableStack', () => {
  it('labels every body cell with its column header and states the table roles', () => {
    const t = table(['zod', 'truefit'], ['z.string()', 'string()']);
    expect(stackTable(t)).toBe(true);
    expect(t.properties).toMatchObject({ 'data-stack': '', role: 'table' });
    const cells = els(els(els(t, 'tbody')[0], 'tr')[0], 'td');
    expect(cells.map((c) => c.properties)).toEqual([
      { role: 'cell', 'data-label': 'zod' },
      { role: 'cell', 'data-label': 'truefit' },
    ]);
    expect(els(els(els(t, 'thead')[0], 'tr')[0], 'th').map((c) => c.properties?.role)).toEqual(['columnheader', 'columnheader']);
  });

  it('gives a row header no label, so it reads as the card’s title', () => {
    const t = table(['', 'passing'], ['chalk', '59']);
    promoteRowHeaders(t);
    stackTable(t);
    const [head, value] = (els(els(t, 'tbody')[0], 'tr')[0]?.children ?? []).filter((c) => c.type === 'element');
    expect(head?.properties).toEqual({ scope: 'row', role: 'rowheader' });
    expect(value?.properties).toEqual({ role: 'cell', 'data-label': 'passing' });
  });

  it('leaves a table with no header row alone', () => {
    const t: Node = { type: 'element', tagName: 'table', properties: {}, children: [{ type: 'element', tagName: 'tbody', properties: {}, children: [row(cell('td', 'a'))] }] };
    expect(stackTable(t)).toBe(false);
    expect(t.properties).toEqual({});
  });

  it('runs after the row-header plugin in the MDX pipeline', () => {
    const plugins = (sourceConfig as { mdxOptions?: { rehypePlugins?: { name: string }[] } }).mdxOptions?.rehypePlugins ?? [];
    expect(plugins.map((p) => p.name)).toEqual(['rehypeRowHeaders', 'rehypeTableStack']);
  });

  it('is folded by global.css under a container query, with each label hidden from assistive tech', () => {
    const css = readFileSync(new URL('global.css', import.meta.url), 'utf8');
    expect(css).toContain('div:has(> table[data-stack])');
    expect(css).toMatch(/@container \(max-width: [\d.]+rem\) \{\s*table\[data-stack\]/u);
    expect(css).toContain("content: attr(data-label) / '';");
  });
});
