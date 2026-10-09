// The repository's own locks must run in a required job, or a combination of PRs that are each
// green alone merges stale: #891 and the generated API reference did on 2026-10-09, and the
// release PR then failed. Quality (Full) Gate is required; its Unit Tests job runs them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'quality-full.yml'), 'utf8');

describe('the root lock suite runs where a PR cannot merge past it', () => {
  it('runs vitest.root.config.ts in quality-full.yml\'s Unit Tests job', () => {
    const job = workflow.slice(workflow.indexOf('\n  test:\n'), workflow.indexOf('\n  build:\n'));
    expect(job).toContain('npx vitest run --config vitest.root.config.ts');
  });
});
