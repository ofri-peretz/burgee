/**
 * The one `next.config` every docs app exports: `export default docsNextConfig();`.
 *
 * Plain JavaScript, because Node loads `next.config.mjs` before any bundler runs. It reads
 * `.github/vercel-apps.json` itself for the same reason, and finds its own app's row by the
 * workspace name in the `package.json` of the directory `next build` runs in — so an app
 * states nothing here, and the row is the only place its facts live.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMDX } from 'fumadocs-mdx/next';

const TABLE = JSON.parse(readFileSync(new URL('../../../.github/vercel-apps.json', import.meta.url), 'utf8'));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The PostHog PROJECT key, with the committed fallback the blog carries for the same reason:
 * `NEXT_PUBLIC_*` is inlined at BUILD time, so a build environment that forgot the variable
 * ships a provider that never initialises — silently, because that branch also serves local
 * dev. The blog lost nine days of analytics that way. A `phc_` key is write-only and made to
 * ship in the browser bundle; it is not the `phx_` personal key, which can read the project.
 * `NEXT_PUBLIC_POSTHOG_KEY` in Vercel still overrides it, which is what makes rotation work.
 */
const POSTHOG_PROJECT_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || 'phc_vNTTtpj4s6nXGJ5pnnXxHey6WBjHJWnytQ4Zv6HeDTT3';

/**
 * The row whose `workspace` is the `name` of the app `next` is running in — a deployable row,
 * or a `pending` one, which builds the same way and is only never deployed.
 */
function ownRow() {
  const { name } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  const found = [...Object.entries(TABLE.apps), ...Object.entries(TABLE.pending ?? {})].find(([, row]) => row.workspace === name);
  if (found === undefined) throw new Error(`${process.cwd()} is workspace '${name}', which no row of .github/vercel-apps.json names`);
  return { key: found[0], ...found[1] };
}

/** `<name>.md` and `<name>.mdx` under `dir`, as slugs; nothing when the directory is absent. */
function slugsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /\.mdx?$/u.test(file))
    .map((file) => file.replace(/\.mdx?$/u, ''));
}

/**
 * Every URL the front door used to serve for a package that now has a host of its own, as a
 * 301 to where it went: `/docs/packages/<pkg>` (and its `.md` twin) to the package's `/docs`,
 * and each `/docs/coming-from/<incumbent>` to the same path on the host whose app now holds
 * that file. Derived from the table and the apps' own content directories, never listed —
 * adding a row adds its redirects, and moving a "coming from" page moves its redirect with it.
 */
export function familyRedirects() {
  return Object.values(TABLE.apps)
    .filter((row) => !row.familyPages)
    .flatMap((row) => {
      const moved = slugsIn(join(REPO_ROOT, row.dir, 'content', 'docs', 'coming-from')).map((slug) => `/docs/coming-from/${slug}`);
      return [
        [`/docs/packages/${row.package}`, `${row.productionUrl}/docs`],
        [`/docs/packages/${row.package}.md`, `${row.productionUrl}/docs.md`],
        ...moved.flatMap((path) => [
          [path, `${row.productionUrl}${path}`],
          [`${path}.md`, `${row.productionUrl}${path}.md`],
        ]),
      ];
    })
    .map(([source, destination]) => ({ source, destination, statusCode: 301 }));
}

/** The config: MDX, the `.md` twins, same-origin PostHog ingest, and — on the front door — the redirects. */
export function docsNextConfig() {
  const row = ownRow();
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()) {
    // Loud at build time; the blog's nine silent days were the lesson.
    console.warn(`[${row.workspace}] NEXT_PUBLIC_POSTHOG_KEY is not set in this build environment — falling back to the committed project key.`);
  }
  const withMDX = createMDX();
  return withMDX({
    reactStrictMode: true,
    // Build cost, measured (docs-per-package): nine apps build in one `turbo run build`, and
    // each `next build` spent ~10 s re-running the type check that each app's own `typecheck`
    // task (`fumadocs-mdx && next typegen && tsc --noEmit`) already runs in the same battery,
    // the same CI job and before every deploy from `main`. So it runs once, there. And a site
    // of a dozen pages does not need a worker per core to prerender them: nine apps each
    // spawning thirteen workers was contention, not parallelism.
    typescript: { ignoreBuildErrors: true },
    experimental: { staticGenerationMinPagesPerWorker: 50 },
    // The front door's `llms.txt` lists `packages/` at build time (`docs-chassis/packages`), and
    // webpack's file tracer reads that `readdirSync` as "every file under `packages/` is needed at
    // run time": 3,865 of them, a vendored suite's fixture directory among them, which
    // `vercel build` then fails to read (EISDIR) and the deploy fails. Every route is prerendered
    // and reads nothing from `packages/` once built, so nothing there is traced
    // (D-20261025-next-16-4-1-security).
    outputFileTracingExcludes: { '*': ['../../packages/**'] },
    // Inlined into the client bundle, so the provider's key check passes even when the build
    // environment forgot to supply one.
    env: { NEXT_PUBLIC_POSTHOG_KEY: POSTHOG_PROJECT_KEY },
    // Required by the ingest proxy: Next would otherwise 308 `/ingest/e/` to `/ingest/e`, and
    // posthog-js does not follow the redirect.
    skipTrailingSlashRedirect: true,
    async redirects() {
      return row.familyPages ? familyRedirects() : [];
    },
    async rewrites() {
      return {
        // The `.md` twin of every docs page — `/docs/<slug>.md`, and `/docs.md` for the index —
        // served by `src/app/md/[[...slug]]/route.ts`. `beforeFiles` because the
        // `docs/[[...slug]]` page segment would otherwise take "compatibility.md" as a slug.
        beforeFiles: [
          { source: '/docs.md', destination: '/md' },
          { source: '/docs/:path*.md', destination: '/md/:path*' },
        ],
        // Same-origin PostHog ingest. Static assets come from a different upstream than the
        // event API, and this entry must precede the catch-all or `:path*` swallows it.
        afterFiles: [
          { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
          { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
        ],
      };
    },
    // Built with webpack, not Turbopack (D-20261025-next-16-4-1-security): every 16.4 release's
    // Turbopack production build grows past 12 GB in its own process within 15 s and is killed,
    // where webpack builds the same app under 3 GB. Turbopack reads `fumadocs-mdx:collections/*`
    // through the app's tsconfig `paths`; webpack takes the `fumadocs-mdx:` prefix for a URI scheme
    // it has no reader for, so the request is rewritten to the generated `.source/` file before
    // resolution, which is where the `paths` entry points.
    webpack(config, { webpack }) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^fumadocs-mdx:collections\//u, (resource) => {
          resource.request = join(process.cwd(), '.source', resource.request.slice('fumadocs-mdx:collections/'.length));
        }),
      );
      return config;
    },
  });
}
