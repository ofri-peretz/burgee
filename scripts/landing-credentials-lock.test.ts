// A job that pushes with its own token must not also carry checkout's persisted GITHUB_TOKEN.
//
// actions/checkout v7 stores that token in an includeIf config, which `git config --unset-all
// http.https://github.com/.extraheader` does not reach, and the header outranks the token in the
// push URL. The landing jobs' pushes went out as github-actions[bot]: PR runs waited for
// approval and the review action refused them (#858, 2026-10-08).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORKFLOWS = join(import.meta.dirname, '..', '.github', 'workflows');

/** `file:job` for every job that pushes with an explicit token yet checks out with persisted credentials. */
export function leaks(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([file, text]) =>
    text
      .split(/\n(?= {2}[\w-]+:\n)/u)
      .filter((job) => /git push[^\n]*x-access-token|git push "\$REMOTE"/u.test(job) && /actions\/checkout@/u.test(job) && !/persist-credentials: false/u.test(job))
      .map((job) => `${file}:${(/^ {2}([\w-]+):/mu.exec(job)?.[1]) ?? '?'}`),
  );
}

describe('landing jobs push as their token, not as github-actions[bot]', () => {
  it('flags a pushing job whose checkout persists credentials', () => {
    const job = '\n  land:\n    steps:\n      - uses: actions/checkout@abc\n      - run: git push "https://x-access-token:${T}@github.com/r.git" b\n';
    expect(leaks({ 'a.yml': `jobs:${job}` })).toEqual(['a.yml:land']);
    expect(leaks({ 'a.yml': `jobs:${job.replace('@abc\n', '@abc\n        with:\n          persist-credentials: false\n')}` })).toEqual([]);
  });

  it('holds for every workflow', () => {
    const files = Object.fromEntries(readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml')).map((f) => [f, readFileSync(join(WORKFLOWS, f), 'utf8')]));
    expect(leaks(files)).toEqual([]);
  });
});
