// B1 measures weekly (on every push to main until 2026-10-18, D-20261019-b1-weekly-not-per-push); its reading must reach the tree, or nothing that reads
// results (the claim table, the agent bands, C1) can see it. Until 2026-10-08 the `agent` job
// only uploaded transcripts, and four CI readings lived only in job logs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const bench = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'bench.yml'), 'utf8');
const agentJob = bench.slice(bench.indexOf('\n  agent:\n'));

describe('B1 lands its own observation', () => {
  // The weekly run lands too (b1-mcp-arm R4): it is the reading that carries the MCP arm. So does a
  // manual dispatch that asks for the arm (D-20261027-b1-mcp-arm-owner-dispatch).
  it('commits the agent-cli-bench result from the agent job on a push, the schedule and an arm dispatch', () => {
    expect(agentJob).toContain('name: Land B1\'s observation');
    expect(agentJob).toMatch(/if: \(github\.event_name == 'push' \|\| github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.mcp-arm\)\) && steps\.status\.outputs\.status == 'measured'/u);
    expect(agentJob).toMatch(/benchmarks\/results\/agent-cli-bench\//u);
    expect(agentJob).toMatch(/git add "\$FILE"/u);
  });

  it('never cancels a started run on main, where B1 spends an hour of agent runs', () => {
    expect(bench).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u);
  });
});
