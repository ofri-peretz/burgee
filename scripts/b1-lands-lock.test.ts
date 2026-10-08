// B1 measures on every push to main; its reading must reach the tree, or nothing that reads
// results (the claim table, the agent bands, C1) can see it. Until 2026-10-08 the `agent` job
// only uploaded transcripts, and four CI readings lived only in job logs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const bench = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'bench.yml'), 'utf8');
const agentJob = bench.slice(bench.indexOf('\n  agent:\n'));

describe('B1 lands its own observation', () => {
  it('commits the agent-cli-bench result from the agent job on a push', () => {
    expect(agentJob).toContain('name: Land B1\'s observation');
    expect(agentJob).toMatch(/if: github\.event_name == 'push' && steps\.status\.outputs\.status == 'measured'/u);
    expect(agentJob).toMatch(/benchmarks\/results\/agent-cli-bench\//u);
    expect(agentJob).toMatch(/git add "\$FILE"/u);
  });
});
