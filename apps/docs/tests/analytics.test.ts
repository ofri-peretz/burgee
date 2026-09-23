/**
 * Vercel Web Analytics is on every page (roadmap `marketing-and-docs` 2.3).
 *
 * Phase 4 of the roadmap starts only once analytics show which `/docs/packages/*` pages
 * are read, so a layout edit that drops `<Analytics />` would not fail anything visible:
 * the dashboard would simply stop receiving page views, and the phase would wait on data
 * that is never coming. This reads the HTML Next prerendered for `/`, as `build-sha.test.ts`
 * does, and follows the `Analytics` client reference in its RSC payload to the chunk that
 * injects Vercel's script.
 *
 * The component injects `/_vercel/insights/script.js` after hydration, so the script tag
 * itself is never in the served HTML; the client reference is what is.
 *
 * Proven red: with `<Analytics />` removed from `layout.tsx` and the app rebuilt, the first
 * test fails with "index.html has no `Analytics` client reference".
 *
 * The agent-facing routes are held static here too, because that is the reason they carry
 * no `track()` call: a `force-static` handler runs once, at build time, with no request and
 * no Vercel request context, so `@vercel/analytics/server` would throw "No session context
 * found" rather than count anything. Their hits are in the project's request logs and
 * Observability. If one of them stops being static, this fails, and that is the moment to
 * revisit counting it in code.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = join(APP, '.next');

function read(file: string): string {
  if (!existsSync(file)) throw new Error(`No ${file}. Run \`npm run build -w docs\` first — \`turbo run test\` does this for you.`);
  return readFileSync(file, 'utf8');
}

describe('Vercel Web Analytics', () => {
  it('the prerendered home page references the Analytics client component', () => {
    const html = read(join(NEXT, 'server', 'app', 'index.html'));
    const ref = /I\[\d+,\[((?:\\"[^"\\]+\\",?)+)\],\\"Analytics\\"\]/.exec(html);
    expect(ref, 'index.html has no `Analytics` client reference — is <Analytics /> still in src/app/layout.tsx?').not.toBeNull();
    const chunks = [...(ref?.[1] ?? '').matchAll(/\\"([^"\\]+)\\"/g)].map((m) => m[1] ?? '');
    const injectsScript = chunks.some((c) => read(join(NEXT, c.replace(/^\/_next\//, ''))).includes('/_vercel/insights/script.js'));
    expect(injectsScript, `none of ${chunks.join(', ')} injects /_vercel/insights/script.js`).toBe(true);
  });

  it.each(['src/app/llms.txt/route.ts', 'src/app/llms-full.txt/route.ts', 'src/app/md/[[...slug]]/route.ts'])(
    '%s is force-static, so it is counted from request logs rather than track()',
    (route) => {
      expect(read(join(APP, route))).toContain("export const dynamic = 'force-static';");
    },
  );
});
