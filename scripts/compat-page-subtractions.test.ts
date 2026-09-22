/**
 * compat-oracle C4: every subtraction from a published number is on the published page.
 *
 * A host's rate leaves the gate four ways, each declared in `hosts.ts` with a mandatory reason:
 * `excludes` (named cases), `controlFailures` (what the real host fails in our harness),
 * `conditionalCases` (cases only some platforms register) and `ungradedDirs` (directories copied
 * and never graded). Until 2026-09-23 only `excludes` reached `compatibility.mdx`, so a reader saw
 * eight named rows and none of the other allowances — the narrowing C4 was written to stop:
 * "an exclusion that grows silently is how a compat claim becomes a lie."
 *
 * Reads the committed page, not the generator, because the page is what a reader sees.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6)
import { HOSTS } from '../packages/compat-oracle/src/hosts.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE = readFileSync(join(root, 'apps/docs/content/docs/compatibility.mdx'), 'utf8');

/** Every declared subtraction, as the kind, the host, and the reason the page must carry. */
const SUBTRACTIONS = HOSTS.filter((h) => h.status === 'active').flatMap((h) => [
  ...(h.excludes ?? []).map((e) => ({ kind: 'excludes', host: h.name, why: e.why })),
  ...(h.controlFailures === undefined ? [] : [{ kind: 'controlFailures', host: h.name, why: h.controlFailures.why }]),
  ...(h.conditionalCases === undefined ? [] : [{ kind: 'conditionalCases', host: h.name, why: h.conditionalCases.why }]),
  ...(h.ungradedDirs ?? []).map((d) => ({ kind: 'ungradedDirs', host: h.name, why: d.why })),
]);

describe('the compatibility page names every subtraction (C4)', () => {
  it('has all four kinds to check, so this cannot pass by finding none', () => {
    expect(new Set(SUBTRACTIONS.map((s) => s.kind))).toEqual(new Set(['excludes', 'controlFailures', 'conditionalCases', 'ungradedDirs']));
  });

  it.each(SUBTRACTIONS)('$host: its $kind is on the page with its reason', ({ why }) => {
    expect(PAGE, 'run `npm run compat:page` — the page is generated from hosts.ts').toContain(why);
  });
});
