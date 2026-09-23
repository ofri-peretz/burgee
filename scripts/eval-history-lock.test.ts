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
 *   1. what `run-evals.ts --record` writes is a valid v1 line, for a measured run and for
 *      a skipped one;
 *   2. every file already committed under `evals/history/` is one v1 line, named for the
 *      date and commit inside it;
 *   3. `evals.yml` still records on its schedule and still lands the line through the
 *      same token fallback `changesets-pr.yml` uses — a recorder that is never invoked
 *      looks exactly like a quiet week.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HISTORY_DIR, HISTORY_FILE, historyFileName, historyLine, historyProblems, parseClaudeJson, serialize, writeHistory } from './eval-history';

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
      cases: {
        'burgee-plugin-from-schema': { status: 'pass', turns: 2, tokens: { input: 12, output: 340, cacheRead: 9000, cacheWrite: 1500 } },
        'roundel-plugin-from-schema': { status: 'error', turns: null, tokens: null },
      },
    });
  });

  it('records a run with no credential as skipped rather than dropping the week', () => {
    const line = historyLine({ ...base, billing: 'none', cases: null });
    expect(historyProblems(line)).toEqual([]);
    expect(line.tasks).toEqual({ status: 'skipped', passed: 0, total: 0, cases: {} });
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

  it('rejects the shapes a renamed or hand-edited line would take', () => {
    const good = historyLine({ ...base, cases: null });
    expect(historyProblems({ ...good, v: 2 })).toContain('v is not 1');
    expect(historyProblems({ ...good, commit: 'abc1234' })).toContain('commit is not a full 40-character sha');
    expect(historyProblems({ ...good, tasks: { ...good.tasks, total: 3 } })).toContain('tasks.total is 3 but 0 case(s) are recorded');
    expect(historyProblems({ ...good, tasks: { status: 'ran', passed: 1, total: 1, cases: { x: { status: 'passed', turns: 1, tokens: null } } } })).toEqual([
      'tasks.passed does not match the cases that passed',
      'tasks.cases.x.status is not pass | fail | error',
    ]);
  });
});

describe('every committed history file is one v1 line', () => {
  const dir = join(REPO_ROOT, HISTORY_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f !== '.gitkeep') : [];

  it.each(files.length > 0 ? files : ['(none yet)'])('%s', (file) => {
    if (file === '(none yet)') return;
    const name = HISTORY_FILE.exec(file);
    expect(name, `${file} is not <YYYY-MM-DD>-<sha7>.json`).not.toBeNull();
    const text = readFileSync(join(dir, file), 'utf8');
    expect(text.endsWith('\n') && text.indexOf('\n') === text.length - 1, `${file} is not exactly one line`).toBe(true);
    const doc = JSON.parse(text) as Parameters<typeof historyFileName>[0];
    expect(historyProblems(doc)).toEqual([]);
    expect(historyFileName(doc)).toBe(file);
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
});
