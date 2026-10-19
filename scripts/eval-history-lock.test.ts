/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the eval history keeps one shape, and the weekly run keeps writing it.
 *
 * `evals/history/` is a series someone will plot, so a renamed field is a silent break in
 * it: the chart keeps drawing and the new weeks read as zero. Three things are held here:
 *
 *   1. what `run-evals.ts --record` writes is a valid v2 line, for a measured run, a skipped
 *      one, and one whose agent never ran (evals-record-not-run);
 *   2. every file already committed under `evals/history/` is one valid line (v1 or v2),
 *      named for the date and commit inside it, and none scores a run that never happened;
 *   3. `evals.yml` still records on its schedule and still lands the line through the
 *      same token fallback `changesets-pr.yml` uses — a recorder that is never invoked
 *      looks exactly like a quiet week.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  caseSeries,
  HISTORY_DIR,
  HISTORY_FILE,
  historyFileName,
  type HistoryLine,
  historyLine,
  historyProblems,
  measured,
  median,
  parseClaudeJson,
  readHistory,
  serialize,
  streak,
  writeHistory,
  zeroTokenProblems,
} from './eval-history';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567';

const claudeJson = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 2,
  result: 'Wrote the plugin. check exits 0.',
  usage: { input_tokens: 12, output_tokens: 340, cache_read_input_tokens: 9000, cache_creation_input_tokens: 1500 },
  modelUsage: { 'claude-sonnet-4-5': { inputTokens: 12 } },
});

describe('parseClaudeJson', () => {
  it('reads the final text, turns, tokens and model out of --output-format json', () => {
    expect(parseClaudeJson(claudeJson)).toEqual({
      text: 'Wrote the plugin. check exits 0.',
      usage: { turns: 2, tokens: { input: 12, output: 340, cacheRead: 9000, cacheWrite: 1500 }, model: 'claude-sonnet-4-5' },
    });
  });

  it('falls back to the raw text, with no usage, for anything that is not that document', () => {
    expect(parseClaudeJson('plain text answer')).toEqual({ text: 'plain text answer', usage: { turns: null, tokens: null, model: null } });
    expect(parseClaudeJson('{"type":"assistant"}').usage.turns).toBeNull();
  });
});

describe('historyLine', () => {
  const base = { date: '2026-09-24', commit: SHA, billing: 'subscription' as const, config: { passed: 4, total: 4 } };

  it('records a measured run with per-case status, turns and tokens', () => {
    const { usage } = parseClaudeJson(claudeJson);
    const line = historyLine({
      ...base,
      cases: [
        { id: 'burgee-plugin-from-schema', status: 'pass', ...usage },
        { id: 'roundel-plugin-from-schema', status: 'error', turns: null, tokens: null, model: null },
      ],
    });
    expect(historyProblems(line)).toEqual([]);
    expect(line.model).toBe('claude-sonnet-4-5');
    expect(line.tasks).toEqual({
      status: 'ran',
      passed: 1,
      total: 2,
      notRun: 0,
      cases: {
        'burgee-plugin-from-schema': { status: 'pass', turns: 2, tokens: { input: 12, output: 340, cacheRead: 9000, cacheWrite: 1500 } },
        'roundel-plugin-from-schema': { status: 'error', turns: null, tokens: null },
      },
    });
  });

  it('records a run with no credential as skipped rather than dropping the week', () => {
    const line = historyLine({ ...base, billing: 'none', cases: null });
    expect(historyProblems(line)).toEqual([]);
    expect(line.tasks).toEqual({ status: 'skipped', passed: 0, total: 0, notRun: 0, cases: {} });
    expect(line.model).toBeNull();
  });

  it('prefers a pinned EVAL_MODEL over the model claude reports', () => {
    const { usage } = parseClaudeJson(claudeJson);
    expect(historyLine({ ...base, pinnedModel: 'claude-opus-4-5', cases: [{ id: 'x', status: 'pass', ...usage }] }).model).toBe('claude-opus-4-5');
  });

  it('writes one line, named for its date and commit', () => {
    const root = mkdtempSync(join(tmpdir(), 'eval-history-'));
    const line = historyLine({ ...base, cases: null });
    const rel = writeHistory(line, root);
    expect(rel).toBe(`${HISTORY_DIR}/2026-09-24-0a1b2c3.json`);
    const text = readFileSync(join(root, rel), 'utf8');
    expect(text).toBe(serialize(line));
    expect(text.split('\n')).toEqual([JSON.stringify(line), '']);
  });

  it('names two runs of one commit on one day apart, so neither overwrites the other', () => {
    // #913 and #914 were two 10/10 runs of 3ff3b8e on 2026-10-09; both wrote 2026-10-09-3ff3b8e.json.
    const a = historyLine({ ...base, run: 37959323649, cases: null });
    const b = historyLine({ ...base, run: 37960474558, cases: null });
    expect(historyFileName(a)).toBe('2026-09-24-0a1b2c3-37959323649.json');
    expect(historyFileName(a)).not.toBe(historyFileName(b));
    expect(HISTORY_FILE.test(historyFileName(a))).toBe(true);
    expect(historyProblems(a)).toEqual([]);
    expect(historyProblems({ ...a, run: 'x' })).toContain('run is not a positive integer');
  });

  it('rejects the shapes a renamed or hand-edited line would take', () => {
    const good = historyLine({ ...base, cases: null });
    expect(historyProblems({ ...good, v: 3 })).toContain('v is not 1 or 2');
    expect(historyProblems({ ...good, commit: 'abc1234' })).toContain('commit is not a full 40-character sha');
    expect(historyProblems({ ...good, tasks: { ...good.tasks, total: 3 } })).toContain('tasks.total + tasks.notRun is 3 but 0 case(s) are recorded');
    expect(historyProblems({ ...good, tasks: { status: 'ran', passed: 1, total: 1, notRun: 0, cases: { x: { status: 'passed', turns: 1, tokens: null } } } })).toEqual([
      'tasks.passed does not match the cases that passed',
      'tasks.cases.x.status is not pass | fail | error | not-run',
    ]);
  });

  it('still accepts a v1 line as written, and still refuses `not-run` inside one', () => {
    const v1 = { v: 1, date: '2026-10-08', commit: SHA, model: 'claude-sonnet-4-5', billing: 'subscription', config: { passed: 4, total: 4 }, tasks: { status: 'ran', passed: 1, total: 1, cases: { x: { status: 'pass', turns: 5, tokens: null } } } };
    expect(historyProblems(v1)).toEqual([]);
    expect(historyProblems({ ...v1, tasks: { status: 'not-run', passed: 0, total: 1, cases: { x: { status: 'not-run', reason: 'usage-limit', excerpt: '', turns: null, tokens: null } } } })).toEqual([
      'tasks.status is not ran | skipped',
      'tasks.cases.x.status is not pass | fail | error',
    ]);
  });
});

/** The text `claude` printed for each case of 2026-10-15 (run 38717342918): no model ran, no token was spent. */
const LIMIT = "You've hit your weekly limit · resets Oct 18, 5am (UTC)";
const notRunCase = (id: string) => ({ id, status: 'not-run' as const, reason: 'usage-limit' as const, excerpt: LIMIT, turns: null, tokens: null, model: null });

describe('evals-record-not-run R2 — a case whose agent never ran has no score', () => {
  const base = { date: '2026-10-15', commit: SHA, billing: 'subscription' as const, config: { passed: 4, total: 4 } };

  it('R2 — records a run whose agent never ran as not-run, with no pass rate', () => {
    const line = historyLine({ ...base, cases: ['a', 'b', 'c'].map(notRunCase) });
    expect(historyProblems(line)).toEqual([]);
    expect(line.v).toBe(2);
    expect(line.model).toBeNull();
    expect(line.tasks).toEqual({
      status: 'not-run',
      reason: 'usage-limit',
      passed: 0,
      total: 0,
      notRun: 3,
      cases: Object.fromEntries(['a', 'b', 'c'].map((id) => [id, { status: 'not-run', reason: 'usage-limit', excerpt: LIMIT, turns: null, tokens: null }])),
    });
  });

  it('counts only the cases that ran when some did not, and names a mixed reason', () => {
    const { usage } = parseClaudeJson(claudeJson);
    const partial = historyLine({ ...base, cases: [{ id: 'ran', status: 'pass', ...usage }, notRunCase('cut')] });
    expect(historyProblems(partial)).toEqual([]);
    expect(partial.tasks).toMatchObject({ status: 'ran', passed: 1, total: 1, notRun: 1 });
    expect(partial.tasks.reason).toBeUndefined();
    const mixed = historyLine({ ...base, cases: [notRunCase('a'), { ...notRunCase('b'), reason: 'auth' }] });
    expect(mixed.tasks).toMatchObject({ status: 'not-run', reason: 'mixed', total: 0, notRun: 2 });
    expect(historyProblems(mixed)).toEqual([]);
  });

  it('R2 — rejects a v2 line whose counts include a not-run case', () => {
    const line = historyLine({ ...base, cases: ['a', 'b'].map(notRunCase) });
    expect(historyProblems({ ...line, tasks: { ...line.tasks, total: 2, notRun: 0 } })).toEqual([
      'tasks.notRun does not match the cases that did not run',
      'a not-run run has total 0: no case ran',
    ]);
    expect(historyProblems({ ...line, tasks: { ...line.tasks, notRun: undefined } })).toContain('tasks.notRun is not a count');
    expect(historyProblems({ ...line, tasks: { ...line.tasks, reason: 'tired' } })).toContain('tasks.reason is not usage-limit | auth | did-not-start | mixed');
    const badCase = { ...line, tasks: { ...line.tasks, cases: { a: { status: 'not-run', reason: 'tired', turns: 1, tokens: null }, b: line.tasks.cases['b'] } } };
    expect(historyProblems(badCase)).toEqual(['tasks.cases.a.reason is not usage-limit | auth | did-not-start', 'tasks.cases.a.excerpt is not a string', 'tasks.cases.a did not run, so it has no turns or tokens']);
  });
});

const at = (date: string, cases: Parameters<typeof historyLine>[0]['cases']): HistoryLine => historyLine({ date, commit: SHA, billing: 'subscription', config: { passed: 4, total: 4 }, cases });
const ran = (id: string, status: 'pass' | 'fail', turns: number) => ({ id, status, turns, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, model: 'm' });
const tenOfTen = (date: string, turns = 7): HistoryLine => at(date, Array.from({ length: 10 }, (_, i) => ran(i === 0 ? 'locale-pack-from-schema' : `case-${String(i)}`, 'pass', turns)));
const notRunWeek = (date: string): HistoryLine => at(date, ['locale-pack-from-schema', ...Array.from({ length: 10 }, (_, i) => `case-${String(i + 1)}`)].map(notRunCase));

describe('evals-record-not-run R4 — readers skip a week that measured nothing', () => {

  it('R4 — a not-run week neither breaks nor counts toward a series', () => {
    const series = [tenOfTen('2026-10-08', 7), notRunWeek('2026-10-15'), tenOfTen('2026-10-22', 5)];
    expect(measured(series).map((l) => l.date)).toEqual(['2026-10-08', '2026-10-22']);
    expect(streak(series)).toBe(2);
    const turns = caseSeries(series, 'locale-pack-from-schema').map((c) => c.turns);
    expect(turns).toEqual([7, 5]);
    expect(median(turns)).toBe(6);
  });

  it('a failing measured week breaks the streak, and a skipped week does not', () => {
    const failing = at('2026-10-01', [ran('a', 'fail', 3)]);
    const skipped = at('2026-10-29', null);
    expect(streak([tenOfTen('2026-09-24'), failing, tenOfTen('2026-10-08'), skipped, tenOfTen('2026-11-05')])).toBe(2);
    expect(streak([at('2026-10-01', [])])).toBe(0);
    expect(caseSeries([at('2026-10-01', [ran('a', 'fail', 3)])], 'absent')).toEqual([]);
    expect(median([])).toBeNull();
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([4, 1, 3])).toBe(3);
  });

  it('reads the committed series in file order, and the corrected 2026-10-15 week is no measurement', () => {
    const lines = readHistory(REPO_ROOT);
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines.map((l) => l.date)).toEqual([...lines.map((l) => l.date)].sort());
    expect(lines.find((l) => l.date === '2026-10-15')?.tasks.status).toBe('not-run');
    expect(measured(lines).some((l) => l.date === '2026-10-15')).toBe(false);
    expect(readHistory(mkdtempSync(join(tmpdir(), 'no-history-')))).toEqual([]);
  });
});

describe('every committed history file is one valid line', () => {
  const dir = join(REPO_ROOT, HISTORY_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f !== '.gitkeep') : [];

  it.each(files.length > 0 ? files : ['(none yet)'])('%s', (file) => {
    if (file === '(none yet)') return;
    const name = HISTORY_FILE.exec(file);
    expect(name, `${file} is not <YYYY-MM-DD>-<sha7>[-<run>].json`).not.toBeNull();
    const text = readFileSync(join(dir, file), 'utf8');
    expect(text.endsWith('\n') && text.indexOf('\n') === text.length - 1, `${file} is not exactly one line`).toBe(true);
    const doc = JSON.parse(text) as Parameters<typeof historyFileName>[0];
    expect(historyProblems(doc)).toEqual([]);
    expect(zeroTokenProblems(doc)).toEqual([]);
    expect(historyFileName(doc)).toBe(file);
  });

  it('refuses a zero-token fail or error: a run that never happened, scored', () => {
    const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const doc = { tasks: { cases: { a: { status: 'fail', turns: 1, tokens: zero }, b: { status: 'error', turns: null, tokens: zero }, c: { status: 'fail', turns: 3, tokens: { ...zero, output: 9 } }, d: { status: 'pass', turns: 1, tokens: zero }, e: { status: 'fail', turns: null, tokens: null } } } };
    expect(zeroTokenProblems(doc)).toEqual([
      'tasks.cases.a: a zero-token case is a run that never happened; record it not-run',
      'tasks.cases.b: a zero-token case is a run that never happened; record it not-run',
    ]);
    expect(zeroTokenProblems(null)).toEqual([]);
  });
});

describe('evals.yml records the weekly run and lands it', () => {
  const wf = readFileSync(join(REPO_ROOT, '.github/workflows/evals.yml'), 'utf8');

  it('still runs on a schedule', () => {
    expect(wf).toMatch(/schedule:\n\s+- cron: /);
  });

  it('passes --record outside pull requests, and uploads what it wrote', () => {
    expect(wf).toContain("github.event_name != 'pull_request' && '--record'");
    expect(wf).toContain('name: evals-history');
  });

  it('lands the line with the release App token, then the PAT, then GITHUB_TOKEN', () => {
    expect(wf).toContain('actions/create-github-app-token@');
    expect(wf).toContain('${{ steps.app.outputs.token || secrets.RELEASE_BOT_PAT || github.token }}');
  });

  it('does not re-run the task evals on the pull request that only lands a line', () => {
    expect(wf).toContain('- "!evals/history/**"');
  });

  it('R5 — a week that did not run opens "did not run", not "failing"', () => {
    const step = wf.slice(wf.indexOf('name: Open an issue on a scheduled failure'));
    expect(wf).toContain('id: run');
    expect(step).toContain('OUTCOME: ${{ steps.run.outputs.outcome }}');
    // The title is chosen by the outcome the runner wrote, and "failing" is the other branch.
    expect(/if \[ "\$OUTCOME" = not-run \]; then\s+TITLE="Agent evals did not run"[\s\S]*else\s+TITLE="Agent evals are failing"/u.test(step)).toBe(true);
  });
});
