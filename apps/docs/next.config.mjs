import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async rewrites() {
    return {
      // The `.md` twin of every docs page — `/docs/<slug>.md`, and `/docs.md` for the index —
      // served by `src/app/md/[[...slug]]/route.ts`. `beforeFiles` because the
      // `docs/[[...slug]]` page segment would otherwise take "compatibility.md" as a slug and
      // render a 404 page; the same reason `ofriperetz.dev` gives for `/articles/<slug>.md`.
      beforeFiles: [
        { source: '/docs.md', destination: '/md' },
        { source: '/docs/:path*.md', destination: '/md/:path*' },
      ],
    };
  },
};

export default withMDX(config);
