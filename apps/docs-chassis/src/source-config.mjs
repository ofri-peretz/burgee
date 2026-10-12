/**
 * The fumadocs-mdx collection every app compiles: `content/docs`, frontmatter and meta
 * schemas as fumadocs ships them. Plain JavaScript on purpose — fumadocs-mdx bundles an app's
 * `source.config.ts` with every package left external, so Node imports this file as it is.
 * An app's own `source.config.ts` is the one re-export line Next and fumadocs need at that
 * path.
 */
import { defineConfig, defineDocs, frontmatterSchema, metaSchema } from 'fumadocs-mdx/config';

import { rehypeRowHeaders } from './rehype-row-headers.mjs';

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

export default defineConfig({
  mdxOptions: {
    // `themes` alone: fumadocs spreads its defaults (`defaultColor: false`, the notation
    // transformers) under whatever is passed here.
    rehypeCodeOptions: { themes: CODE_THEMES },
    rehypePlugins: [rehypeRowHeaders],
  },
});
