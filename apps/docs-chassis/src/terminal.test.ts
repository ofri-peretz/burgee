/**
 * A `text` fence with a title is a command over its output, and only that fence is marked as a
 * terminal: `mdx.tsx` renders the mark as {@link TerminalBlock}, and every other fence as
 * fumadocs does. Run through fumadocs' own rehype-code with the options `source-config.mjs`
 * actually passes, so the test also holds that the notation transformers are still there.
 */
import { rehypeCode } from 'fumadocs-core/mdx-plugins';
import { describe, expect, it } from 'vitest';

import config from './source-config.mjs';

interface Hast {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  data?: { meta?: string };
  children?: Hast[];
  value?: string;
}

/** The `<pre>` rehype-code makes of one fence, as `options.mdxOptions` configures it. */
async function fence(lang: string, meta: string, code = 'hello\n'): Promise<Hast | undefined> {
  const pre: Hast = { type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'element', tagName: 'code', properties: { className: [`language-${lang}`] }, data: { meta }, children: [{ type: 'text', value: code }] }] };
  const tree: Hast = { type: 'root', children: [pre] };
  const options = (config as { mdxOptions?: { rehypeCodeOptions?: object } }).mdxOptions?.rehypeCodeOptions;
  // Called as unified would call it, without a processor: the plugin reads neither `this` nor the file.
  const plugin = rehypeCode as unknown as (options?: object) => (tree: Hast, file: object) => Promise<void>;
  await plugin(options)(tree, {});
  return firstPre(tree);
}

/** rehype-code swaps the fence for a fragment of its own, so the `<pre>` is found, not indexed. */
function firstPre(node: Hast): Hast | undefined {
  if (node.tagName === 'pre') return node;
  for (const child of node.children ?? []) {
    const found = firstPre(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe('terminal fences', () => {
  it('marks a text fence whose title is the command', async () => {
    expect((await fence('text', 'title="node first.mjs"'))?.properties?.['data-terminal']).toBe('');
  });

  it('leaves a titled code fence, an untitled text fence and a diff alone', async () => {
    const cases = [['js', 'title="first.mjs"'], ['text', ''], ['diff', 'title="x"']] as const;
    const pres = await Promise.all(cases.map(([lang, meta]) => fence(lang, meta)));
    for (const [i, pre] of pres.entries()) {
      expect(pre?.tagName, cases[i]?.join(' ')).toBe('pre');
      expect(pre?.properties?.['data-terminal'], cases[i]?.join(' ')).toBeUndefined();
    }
  });

  it('keeps fumadocs’ notation transformers, which passing `transformers` would otherwise drop', async () => {
    const pre = await fence('js', '', 'const a = 1; // [!code highlight]\n');
    expect(JSON.stringify(pre)).toContain('highlighted');
  });
});
