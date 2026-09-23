/**
 * The fumadocs-mdx collection every app compiles: `content/docs`, frontmatter and meta
 * schemas as fumadocs ships them. Plain JavaScript on purpose — fumadocs-mdx bundles an app's
 * `source.config.ts` with every package left external, so Node imports this file as it is.
 * An app's own `source.config.ts` is the one re-export line Next and fumadocs need at that
 * path.
 */
import { defineConfig, defineDocs, frontmatterSchema, metaSchema } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: { schema: frontmatterSchema },
  meta: { schema: metaSchema },
});

export default defineConfig();
