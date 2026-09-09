/**
 * The producing half of the post-deploy check.
 *
 * `deploy-docs.yml` reads `<meta name="x-build-sha">` back off the deployed URL and fails
 * the run when it is absent or names another commit — that is how a deploy which uploaded
 * successfully but left the alias on the previous build is caught. The check is only ever
 * as real as the tag, and nothing on this side of the wire pinned the tag: deleting
 * `other: { 'x-build-sha': BUILD_SHA }` from `src/app/layout.tsx` left `turbo run build
 * test` and the whole root suite green, and turned the verification into a step that
 * could only start failing after a deploy, in the one place nobody is watching.
 *
 * So this reads the HTML Next actually *prerendered* — the bytes the CDN serves for `/`,
 * which is the exact URL the workflow curls — rather than the module that produced it.
 *
 * Proven red: with that one line removed from `layout.tsx` and the app rebuilt,
 * "stamps the commit it was built from into the home page" fails with
 * `.next/server/app/index.html carries no <meta name="x-build-sha">`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRERENDERED = join(APP, '.next', 'server', 'app');

/**
 * What `layout.tsx` should have resolved `BUILD_SHA` to for *this* build. Turbo's Next
 * framework inference puts `NEXT_PUBLIC_*` in the task hash, so a change to it is a cache
 * miss and the artifact on disk always answers to the environment this test reads.
 */
const EXPECTED = process.env.NEXT_PUBLIC_BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

/** A prerendered page, or a failure that names the build step that did not run. */
function html(route: string): string {
  const file = join(PRERENDERED, route);
  if (!existsSync(file)) throw new Error(`No prerendered ${route} at ${file}. Run \`npm run build -w docs\` first — \`turbo run test\` does this for you.`);
  return readFileSync(file, 'utf8');
}

/** The `content` of `<meta name="x-build-sha">`, or null when the tag is not there. */
function stampedSha(page: string): string | null {
  return /<meta[^>]*name="x-build-sha"[^>]*content="([^"]*)"/.exec(page)?.[1] ?? /<meta[^>]*content="([^"]*)"[^>]*name="x-build-sha"/.exec(page)?.[1] ?? null;
}

describe('every page says which commit it was built from', () => {
  it('stamps the commit it was built from into the home page', () => {
    // `/` is the URL the post-deploy check reads, so this is the one that has to carry it.
    const sha = stampedSha(html('index.html'));
    expect(sha, '.next/server/app/index.html carries no <meta name="x-build-sha">, so the post-deploy check in deploy-docs.yml can only ever fail — and only after a deploy').not.toBeNull();
    expect(sha).toBe(EXPECTED);
  });

  it('stamps it on the docs pages too, not only the home page', () => {
    // It comes from the root layout's metadata, so losing it on one route means the
    // layout changed shape — worth knowing before a deploy rather than after.
    expect(stampedSha(html('docs.html'))).toBe(EXPECTED);
  });

  it('never ships an empty stamp', () => {
    // `content=""` satisfies "the tag is present" and defeats the check just as
    // thoroughly: the workflow treats an empty read as "not serving a build of this app".
    expect(EXPECTED.length).toBeGreaterThan(0);
    expect(stampedSha(html('index.html'))).not.toBe('');
  });
});
