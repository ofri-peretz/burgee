/**
 * Install fences become package-manager tabs. Checked on the mdast the plugin sees, so a fence
 * it should leave alone (an `npx` line, a titled fence, a mixed script) is proven untouched.
 */
import { describe, expect, it } from 'vitest';

import { PACKAGE_MANAGER_GROUP, isInstallFence, remarkInstallTabs } from './remark-install-tabs.mjs';
import sourceConfig from './source-config.mjs';

interface Node {
  type: string;
  name?: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  attributes?: { name: string; value: unknown }[];
  children?: Node[];
}

const fence = (value: string, lang = 'bash', meta: string | null = null): Node => ({ type: 'code', lang, meta, value });
const run = (...children: Node[]): Node => {
  const tree: Node = { type: 'root', children };
  const file = { value: '', path: 'x.mdx' };
  (remarkInstallTabs() as (t: Node, f: unknown) => void)(tree, file);
  return tree;
};
const codes = (node: Node): Node[] => (node.type === 'code' ? [node] : (node.children ?? []).flatMap(codes));

describe('remarkInstallTabs', () => {
  it('turns an npm install fence into one tab per package manager, npm first, the choice shared', () => {
    const [tabs] = run(fence('npm install --save-dev oxmutate')).children ?? [];
    expect(tabs?.name).toBe('CodeBlockTabs');
    expect(tabs?.attributes).toEqual(
      expect.arrayContaining([
        { type: 'mdxJsxAttribute', name: 'defaultValue', value: 'npm' },
        { type: 'mdxJsxAttribute', name: 'groupId', value: PACKAGE_MANAGER_GROUP },
      ]),
    );
    expect(codes(tabs ?? { type: 'x' }).map((c) => c.value)).toEqual([
      'npm install --save-dev oxmutate',
      'pnpm add --save-dev oxmutate',
      'yarn add --dev oxmutate',
      'bun add --dev oxmutate',
    ]);
  });

  it('takes several install lines, and every shell spelling', () => {
    expect(isInstallFence(fence('npm install controlroom\nnpm i react react-reconciler\n', 'sh'))).toBe(true);
    expect(isInstallFence(fence('npm add @scope/pkg@1.2.3', 'zsh'))).toBe(true);
  });

  it('leaves alone what has no one translation: npx, a mixed script, a titled or non-shell fence', () => {
    for (const node of [
      fence('npx oxmutate run'),
      fence('npm install caique\npnpm add caique'),
      fence('cd my-chat && npm install && node chat.mjs'),
      fence('npm install'),
      fence('npm install truefit', 'bash', 'title="install"'),
      fence('npm install truefit', 'text'),
      fence('npm install truefit; rm -rf /'),
    ]) {
      expect(isInstallFence(node), node.value).toBe(false);
      expect(run(node).children?.[0]).toBe(node);
    }
  });

  it('runs in every docs app', () => {
    expect(sourceConfig).toMatchObject({ mdxOptions: { remarkPlugins: expect.arrayContaining([remarkInstallTabs]) as unknown } });
  });
});
