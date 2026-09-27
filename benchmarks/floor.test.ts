/**
 * N10's harness, tested without the two binaries it drives — so the parser, the pin and the
 * record shape are checked on every machine, and only the measurement itself needs the tools.
 *
 * The reports below are shaped exactly as the pinned versions print them: `Score` in
 * clispec-cli's `src/scorer.rs` at v0.3.0, `jsonReport` in cli-agent-lint's `report/json.go`
 * at v0.3.5. If either tool changes shape under a bumped pin, the parser refuses rather than
 * reading a missing field as zero.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { agentLintFailures, agentLintRecord, clispecFailures, clispecRecord, parseAgentLint, parseClispec } from './axes/floor.js';
import { platform, TOOLS, verify } from './floor-tools.js';

const tool = (id: string) => TOOLS.find((t) => t.id === id) as (typeof TOOLS)[number];

const CLISPEC_REPORT = JSON.stringify({
  tool: '/tmp/demo-burgee',
  path: '/tmp/demo-burgee',
  score: 17,
  max: 24,
  percentage: 70,
  grade: 'Good',
  principles: [
    { name: 'Schema', score: 1, max: 6, checks: [{ name: 'schema command exists', passed: false, checklist: 'schema-validates' }, { name: 'schema works without config', passed: true, checklist: 'schema-offline' }] },
    { name: 'Streams', score: 4, max: 4, checks: [{ name: 'Clean stdout when piped', passed: true, checklist: 'stream-separation' }] },
  ],
});

const AGENT_LINT_REPORT = JSON.stringify({
  version: '1.0.0',
  target: '/tmp/demo-burgee',
  score: { percentage: 81.25, grade: 'B' },
  summary: { total: 34, pass: 26, warn: 3, fail: 1, skip: 4, error: 0 },
  checks: [
    { id: 'FS-1', name: 'Stderr vs stdout discipline', status: 'pass' },
    { id: 'TE-5', name: 'Pagination support', status: 'warn' },
    { id: 'SA-2', name: 'Rejects path traversal', status: 'fail' },
    { id: 'PV-6', name: 'Long-running operation support', status: 'skip' },
    { id: 'SD-5', name: 'Skill / context files', status: 'info' },
  ],
  categories: [],
});

describe('parsing what the checkers print', () => {
  it('reads clispec’s score, and names every failed check with the checklist item it cites', () => {
    const report = parseClispec(CLISPEC_REPORT);
    expect(report.score).toBe(17);
    expect(clispecFailures(report)).toEqual(['schema command exists [schema-validates]']);
  });

  it('reads cli-agent-lint’s percentage, and counts warn and info as not passed — only pass and skip are', () => {
    const report = parseAgentLint(AGENT_LINT_REPORT);
    expect(report.score.percentage).toBe(81.25);
    expect(agentLintFailures(report)).toEqual(['TE-5 Pagination support (warn)', 'SA-2 Rejects path traversal (fail)', 'SD-5 Skill / context files (info)']);
  });

  it('refuses output that is not JSON, rather than scoring it as zero', () => {
    expect(() => parseClispec('Score: 17/24')).toThrow(/printed no JSON/);
  });

  it('refuses a report missing a field, so a changed output shape cannot read as a score of nothing', () => {
    expect(() => parseAgentLint(JSON.stringify({ score: { percentage: 1, grade: 'F' }, checks: [] }))).toThrow(/has no summary/);
    expect(() => parseClispec(JSON.stringify({ score: 1, max: 24 }))).toThrow(/has no percentage, grade, principles/);
  });
});

describe('records', () => {
  it('one record per tool per variant, in the shape every axis emits, naming the pinned version', () => {
    const record = clispecRecord('commander', parseClispec(CLISPEC_REPORT), tool('clispec'));
    expect(record).toMatchObject({ axis: 'floor', variant: 'commander', metric: 'clispec-score', unit: 'points', samples: 1, median: 17, p95: 17 });
    expect(record.detail).toMatchObject({ tool: 'clispec 0.3.0', max: 24, failed: 'schema command exists [schema-validates]' });
  });

  it('gates burgee alone — the incumbents are graded, never held to our ratchet', () => {
    const report = parseAgentLint(AGENT_LINT_REPORT);
    expect(agentLintRecord('burgee', report, tool('cli-agent-lint')).gate).toBeDefined();
    expect(agentLintRecord('yargs', report, tool('cli-agent-lint')).gate).toBeUndefined();
    expect(clispecRecord('commander', parseClispec(CLISPEC_REPORT), tool('clispec')).gate).toBeUndefined();
  });

  it('keeps cli-agent-lint’s percentage to one place, as its own report rounds it', () => {
    expect(agentLintRecord('burgee', parseAgentLint(AGENT_LINT_REPORT), tool('cli-agent-lint')).median).toBe(81.3);
  });
});

describe('the pin', () => {
  it('pins each tool to one version and a SHA-256 for every platform it can run on', () => {
    for (const t of TOOLS) {
      for (const archive of Object.values(t.archives)) {
        expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(archive.url).toContain(t.version);
        expect(archive.url.startsWith('https://github.com/')).toBe(true);
      }
    }
  });

  it('measures against exactly the two tools N10 names', () => {
    expect(TOOLS.map((t) => `${t.id}@${t.version}`)).toEqual(['clispec@0.3.0', 'cli-agent-lint@0.3.5']);
  });

  it('refuses an archive whose digest is not the pinned one', () => {
    const bytes = new TextEncoder().encode('not the release');
    const archive = { url: 'https://example.invalid/x.tar.gz', sha256: '0'.repeat(64) };
    expect(() => verify(bytes, archive)).toThrow(/refusing to measure/);
    expect(() => verify(bytes, { ...archive, sha256: createHash('sha256').update(bytes).digest('hex') })).not.toThrow();
  });

  it('knows the four platforms it has archives for, and no others', () => {
    expect(platform('linux', 'x64')).toBe('linux-x64');
    expect(platform('darwin', 'arm64')).toBe('darwin-arm64');
    expect(platform('win32', 'x64')).toBeUndefined();
  });
});
