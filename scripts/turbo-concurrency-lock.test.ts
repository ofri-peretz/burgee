// Every CI step that runs turbo across the whole workspace caps its concurrency.
//
// An unfiltered `turbo run build` (or `test`/`typecheck`, which depend on `build`) builds every
// docs app. At turbo's default of ten tasks, ten `next build`s at once killed ubuntu runners with
// exit 137 and "received a shutdown signal": 9 of 25 Quality (Full) runs failed that way on
// 2026-10-06, blocking two releases. A `--filter` scopes the run, so filtered steps are exempt.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORKFLOWS = join(import.meta.dirname, '..', '.github', 'workflows');
const WHOLE_WORKSPACE = /\brun:\s*(?:npx turbo run (?:build|test|typecheck)\b|npm (?:run )?(?:build|typecheck|test)\b)/u;

/** `file:line` for every whole-workspace turbo step with no `--concurrency`. */
export function uncapped(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([file, text]) =>
    text.split('\n').flatMap((line, i) => (WHOLE_WORKSPACE.test(line) && !line.includes('--filter') && !line.includes('--concurrency') ? [`${file}:${i + 1}`] : [])),
  );
}

describe('turbo concurrency lock', () => {
  it('finds an uncapped step, and passes a capped or filtered one', () => {
    expect(uncapped({ 'a.yml': '      - run: npx turbo run build\n      - run: npm run build -- --concurrency=4\n      - run: npx turbo run build --filter=x\n        run: npm test' })).toEqual(['a.yml:1', 'a.yml:4']);
  });

  it('caps every whole-workspace turbo step in .github/workflows', () => {
    const files = Object.fromEntries(readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml')).map((f) => [f, readFileSync(join(WORKFLOWS, f), 'utf8')]));
    expect(uncapped(files)).toEqual([]);
  });
});
