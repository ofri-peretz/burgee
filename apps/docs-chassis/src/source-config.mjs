/**
 * The fumadocs-mdx collection every app compiles: `content/docs`, frontmatter and meta
 * schemas as fumadocs ships them. Plain JavaScript on purpose — fumadocs-mdx bundles an app's
 * `source.config.ts` with every package left external, so Node imports this file as it is.
 * An app's own `source.config.ts` is the one re-export line Next and fumadocs need at that
 * path.
 */
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';
import { defineConfig, defineDocs, frontmatterSchema, metaSchema } from 'fumadocs-mdx/config';

import { rehypeRowHeaders } from './rehype-row-headers.mjs';
import { rehypeTableStack } from './rehype-table-stack.mjs';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: { schema: frontmatterSchema },
  meta: { schema: metaSchema },
});

/**
 * The code-block themes. fumadocs' default pair, `github-light` / `github-dark`, fails WCAG AA
 * on our own grounds — measured by Lighthouse on every docs site: github-dark's comments
 * (#6a737d) read 3.82:1 on the dark card, github-light's orange (#e36209) 3.48:1 on white.
 * GitHub's `-default` pair is the same palette tuned to clear 4.5:1, and
 * `code-contrast.test.ts` holds every token of both to that floor against the card colours
 * `global.css` states.
 */
export const CODE_THEMES = /** @type {const} */ ({ light: 'github-light-default', dark: 'github-dark-default' });

/**
 * Marks a terminal fence: ```` ```text title="node first.mjs" ````, a command over its output.
 * Every `text` fence with a title in the docs is one (254 of 254 when this was written), so the
 * fence needs no new syntax; `mdx.tsx` renders a marked `<pre>` as a terminal. A shiki
 * transformer: `this.options` is the fence's language and its parsed meta.
 */
export const transformerTerminal = {
  name: 'docs-chassis:terminal',
  pre(node) {
    const meta = /** @type {{ title?: unknown }} */ (this.options.meta ?? {});
    if (this.options.lang === 'text' && typeof meta.title === 'string' && meta.title !== '') node.properties['data-terminal'] = '';
    return node;
  },
};

export default defineConfig({
  mdxOptions: {
    // fumadocs spreads its defaults (`defaultColor: false`, the notation transformers) under
    // whatever is passed here, one key at a time: `transformers` replaces fumadocs' list rather than adding to it, so its defaults (the
    // `// [!code …]` notations) are passed back first.
    rehypeCodeOptions: { themes: CODE_THEMES, transformers: [...(rehypeCodeDefaultOptions.transformers ?? []), transformerTerminal] },
    rehypePlugins: [rehypeRowHeaders, rehypeTableStack],
  },
});
