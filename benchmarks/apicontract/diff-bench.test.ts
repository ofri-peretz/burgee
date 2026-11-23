import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type DiffRow, foldDiff, renderDiffSummary, summarize } from './diff-bench.js';
import { judgeLint, judgeOasdiff, judgeOpenapiDiff, judgeOptic, judgeOurs, TOOLS } from './diff-tools.js';

const row = (pair: string, tool: string, label: DiffRow['label'], verdict: DiffRow['verdict']): DiffRow => ({ pair, tool, label, timing: false, verdict, ms: 10, error: verdict === 'crash' ? 'boom' : null });
const timed = (one: DiffRow, ms: number): DiffRow => ({ ...one, ms, timing: true });
const json = (verdict: string) => ran(0, JSON.stringify({ data: { verdict } }));
const ran = (status: number | null, stdout = '', stderr = '') => ({ status, stdout, stderr });

const OASDIFF = [row('a', 'oasdiff', 'breaking', 'breaking'), row('b', 'oasdiff', 'breaking', 'non-breaking'), row('c', 'oasdiff', 'non-breaking', 'non-breaking'), row('d', 'oasdiff', 'non-breaking', 'crash')];
const OURS = [
  timed(row('a', 'contractdiff', 'breaking', 'breaking'), 30),
  timed(row('b', 'contractdiff', 'breaking', 'breaking'), 10),
  timed(row('c', 'contractdiff', 'non-breaking', 'breaking'), 20),
  row('d', 'contractdiff', 'non-breaking', 'non-breaking'),
  timed(row('e', 'contractdiff', 'breaking', 'crash'), 999),
];

describe('foldDiff', () => {
  it('counts D2 and D3 over the pairs read, D1 over the pairs both read, D4 over timing pairs that did not crash', () => {
    const folded = foldDiff('contractdiff', 'diff', OURS, OASDIFF);
    expect(folded).toEqual({
      tool: 'contractdiff',
      kind: 'diff',
      rows: 5,
      crashes: 1,
      timingMedianMs: 20,
      missed: { count: 0, of: 2 },
      falseAlarms: { count: 1, of: 2 },
      agreesWithOasdiff: { count: 1, of: 3 },
      disagreements: ['c: labelled non-breaking, said breaking'],
    });
    expect(foldDiff('oasdiff', 'diff', OASDIFF, OASDIFF)).toMatchObject({ missed: { count: 1, of: 2 }, agreesWithOasdiff: { count: 3, of: 3 }, timingMedianMs: null });
  });

  it('reads a linter for time and crashes only', () => {
    expect(foldDiff('spectral', 'lint', [timed(row('x', 'spectral', null, 'ran'), 5), row('y', 'spectral', null, 'crash')])).toEqual({ tool: 'spectral', kind: 'lint', rows: 2, crashes: 1, timingMedianMs: 5, disagreements: [] });
  });
});

describe('summarize and renderDiffSummary', () => {
  it('puts contractdiff first, then differs, then linters, and renders every table', () => {
    const lint = [timed(row('x', 'redocly', null, 'ran'), 7)];
    const summaries = summarize({ redocly: lint, oasdiff: OASDIFF, contractdiff: OURS, optic: [] }, { contractdiff: 'diff', oasdiff: 'diff', optic: 'diff', redocly: 'lint' });
    expect(summaries.map((s) => s.tool)).toEqual(['contractdiff', 'oasdiff', 'optic', 'redocly']);
    const markdown = renderDiffSummary('run-1', summaries, 1);
    expect(markdown).toContain('| contractdiff | 0.0% (0/2) | 50.0% (1/2) | 33.3% (1/3) | 20 ms | 1/5 |');
    expect(markdown).toContain('| optic | — | — | — | — | 0/0 |');
    expect(markdown).toContain('| redocly | 7 ms | 0/1 |');
    expect(markdown).toContain('## oasdiff: 1 disagreement(s) with the label');
    expect(markdown).toContain('- none');
    const many = renderDiffSummary('run-2', [foldDiff('t', 'diff', [row('p', 't', 'breaking', 'non-breaking'), row('q', 't', 'breaking', 'non-breaking')])], 1);
    expect(many).toContain('- … and 1 more in `t.jsonl`');
    expect(many).not.toContain('| linter |');
  });

  it('reads an unknown tool as a differ and no oasdiff rows as no agreement', () => {
    expect(summarize({ x: [row('a', 'x', 'breaking', 'breaking')] }, {})[0]).toMatchObject({ kind: 'diff', agreesWithOasdiff: { count: 0, of: 0 } });
  });
});

describe('the judges', () => {
  it('reads contractdiff --json: unknown fails as breaking, dangerous passes', () => {
    expect(judgeOurs(json('breaking')).verdict).toBe('breaking');
    expect(judgeOurs(json('unknown')).verdict).toBe('breaking');
    expect(judgeOurs(json('dangerous')).verdict).toBe('non-breaking');
    expect(judgeOurs(json('non-breaking'))).toEqual({ verdict: 'non-breaking', error: null });
    expect(judgeOurs(json('other'))).toEqual({ verdict: 'crash', error: '{"data":{"verdict":"other"}}' });
    expect(judgeOurs(ran(2, '', 'Error: cannot read\n  at x'))).toEqual({ verdict: 'crash', error: 'Error: cannot read' });
    expect(judgeOurs(ran(null))).toEqual({ verdict: 'crash', error: 'exit null, no output' });
  });

  it('reads oasdiff, openapi-diff and optic by exit code and the text that goes with it', () => {
    expect([0, 1, 101].map((s) => judgeOasdiff(ran(s)).verdict)).toEqual(['non-breaking', 'breaking', 'crash']);
    expect(judgeOpenapiDiff(ran(0)).verdict).toBe('non-breaking');
    expect(judgeOpenapiDiff(ran(1, 'Breaking changes found between the two specifications')).verdict).toBe('breaking');
    expect(judgeOpenapiDiff(ran(1, '', 'ERROR: unable to parse')).verdict).toBe('crash');
    expect(judgeOptic(ran(0)).verdict).toBe('non-breaking');
    expect(judgeOptic(ran(1, '2 checks failed')).verdict).toBe('breaking');
    expect(judgeOptic(ran(1, '', 'Error: could not read old.json')).verdict).toBe('crash');
    expect(judgeOptic(ran(2)).verdict).toBe('crash');
    expect([0, 1, 2].map((s) => judgeLint(ran(s)).verdict)).toEqual(['ran', 'ran', 'crash']);
  });
});

describe('the tools', () => {
  it('pins every competitor to an exact version and names each once', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['contractdiff', 'oasdiff', 'openapi-diff', 'optic', 'spectral', 'redocly']);
    for (const tool of TOOLS.slice(1)) expect(tool.pin).toMatch(/@v?\d+\.\d+\.\d+$/);
  });

  it('builds each command from the install folder and the pair', () => {
    const commands = TOOLS.map((t) => t.command('/t', '/p/old.json', '/p/new.json'));
    expect(commands[0]?.args.slice(1)).toEqual(['diff', '/p/old.json', '/p/new.json', '--json']);
    // path.join, so Windows builds a backslash path: the expectation follows the platform separator.
    expect(commands[1]).toEqual({ file: path.join('/t', 'oasdiff'), args: ['breaking', '/p/old.json', '/p/new.json', '--fail-on', 'ERR'] });
    expect(commands[3]?.args).toEqual(['diff', '/p/old.json', '/p/new.json', '--check']);
    expect(commands[5]?.args).toEqual(['lint', '/p/new.json', '--format', 'json']);
  });
});
