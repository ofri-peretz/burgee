/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The citation probe's run: skipped without a credential (and nothing spawned), `error` on
 * a failed `claude` run, scored on a good one, always one observation per question, and
 * always the roadmap's five questions. `claude` is a stub shell script in every test;
 * nothing here reaches a model.
 */
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PROBE_DIR, probeProblems, QUESTIONS, runProbe, writeProbe } from './citation-probe';
import { answeringModel, claudeArgs, MAX_TURNS, MODEL, parseClaudeOutput } from './citation-probe-claude';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567';
const DATE = '2026-09-27';
const EXECUTABLE = 0o755;
const POSIX = process.platform !== 'win32';

interface Stub {
  bin: string;
  /** One line per invocation: the argv, then the credential env the child saw. */
  calls: () => string[];
}

/**
 * A `claude` that logs each call and then runs `body` (POSIX shell). The log records the
 * argv and whether the child saw `ANTHROPIC_API_KEY`, which it must not.
 */
function stubClaude(body: string): Stub {
  const dir = mkdtempSync(join(tmpdir(), 'stub-claude-'));
  const bin = join(dir, 'claude');
  const log = join(dir, 'calls.log');
  writeFileSync(bin, `#!/bin/sh\nprintf '%s|key=%s\\n' "$*" "\${ANTHROPIC_API_KEY:-}" >> '${log}'\n${body}\n`);
  chmodSync(bin, EXECUTABLE);
  return { bin, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l !== '') : []) };
}

/** A stub that prints `json` on stdout and exits `code`. */
const printing = (json: unknown, code = 0): Stub => stubClaude(`cat <<'JSON'\n${JSON.stringify(json)}\nJSON\nexit ${code}`);

/** The shape `claude -p --output-format json` reports on success. */
const success = (result: string): Record<string, unknown> => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 4,
  total_cost_usd: 0.1834,
  result,
  modelUsage: {
    'claude-haiku-4-5': { inputTokens: 900, outputTokens: 60, costUSD: 0.001 },
    'claude-opus-5-5': { inputTokens: 5000, outputTokens: 700, costUSD: 0.18 },
  },
});

const TOKEN = { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-test' };
const quiet = (): void => {};

describe('the questions', () => {
  it('are the five in .sdlc/roadmap/marketing-and-docs.md, verbatim and in order', () => {
    const roadmap = readFileSync(join(REPO_ROOT, '.sdlc/roadmap/marketing-and-docs.md'), 'utf8').replaceAll('\r\n', '\n');
    const start = roadmap.indexOf('The five probe questions are fixed');
    expect(start).toBeGreaterThan(-1);
    const block = roadmap.slice(start).split('\n\n')[1] ?? '';
    const listed = [...block.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]);
    expect(listed).toEqual([...QUESTIONS]);
  });
});

describe.skipIf(!POSIX)('runProbe without a credential', () => {
  it('skips loudly, spawns nothing, and writes a valid all-skipped run', () => {
    const stub = printing(success('burgee'));
    const notices: string[] = [];
    const run = runProbe({ env: {}, date: DATE, commit: SHA, claudeBin: stub.bin, notice: (l) => notices.push(l) });

    expect(stub.calls()).toEqual([]);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/^::notice.*CLAUDE_CODE_OAUTH_TOKEN/);
    expect(run.assistants).toEqual({ claude: { status: 'skipped', secret: 'CLAUDE_CODE_OAUTH_TOKEN', requested: MODEL } });
    expect(run.observations).toHaveLength(5);
    expect(run.observations.every((o) => o.status === 'skipped' && !o.named && o.model === null && o.exitCode === null)).toBe(true);
    expect(probeProblems(run)).toEqual([]);

    const root = mkdtempSync(join(tmpdir(), 'citation-probe-'));
    const rel = writeProbe(run, root);
    expect(rel).toBe(`${PROBE_DIR}/${DATE}.json`);
    expect(probeProblems(JSON.parse(readFileSync(join(root, rel), 'utf8')))).toEqual([]);
  });

  it('treats a blank token as missing, and an API key as no credential at all', () => {
    const stub = printing(success('x'));
    const run = runProbe({ env: { CLAUDE_CODE_OAUTH_TOKEN: '  ', ANTHROPIC_API_KEY: 'sk-ant-api' }, date: DATE, commit: SHA, claudeBin: stub.bin, notice: quiet });
    expect(run.assistants.claude.status).toBe('skipped');
    expect(stub.calls()).toEqual([]);
  });

  it('uses a stored login only when opted in, and only when `claude auth status` says it is logged in', () => {
    const loggedIn = stubClaude(`if [ "$1" = auth ]; then echo '{"loggedIn":true}'; exit 0; fi\ncat <<'JSON'\n${JSON.stringify(success('Try burgee.'))}\nJSON`);
    expect(runProbe({ env: {}, date: DATE, commit: SHA, claudeBin: loggedIn.bin, notice: quiet }).assistants.claude.status).toBe('skipped');
    expect(loggedIn.calls()).toEqual([]);
    const run = runProbe({ env: { BURGEE_USE_CLAUDE_LOGIN: '1' }, date: DATE, commit: SHA, claudeBin: loggedIn.bin, notice: quiet });
    expect(run.assistants.claude.status).toBe('ran');
    expect(run.observations.every((o) => o.status === 'ok' && o.named)).toBe(true);

    const loggedOut = stubClaude(`echo '{"loggedIn":false}'; exit 1`);
    expect(runProbe({ env: { BURGEE_USE_CLAUDE_LOGIN: '1' }, date: DATE, commit: SHA, claudeBin: loggedOut.bin, notice: quiet }).assistants.claude.status).toBe('skipped');
    expect(loggedOut.calls()).toEqual(['auth status|key=']);
  });
});

describe.skipIf(!POSIX)('runProbe with the token', () => {
  it('parses a successful JSON result into a scored observation', () => {
    const stub = printing(success('burgee is a drop-in for commander. See https://burgee.interlace.tools/ and [commander](https://github.com/tj/commander.js).'));
    const run = runProbe({ env: { ...TOKEN, ANTHROPIC_API_KEY: 'sk-ant-api' }, date: DATE, commit: SHA, claudeBin: stub.bin, notice: quiet });

    expect(run.assistants.claude).toEqual({ status: 'ran', secret: 'CLAUDE_CODE_OAUTH_TOKEN', requested: MODEL });
    expect(run.observations).toHaveLength(5);
    expect(run.observations[0]).toMatchObject({
      question: 1,
      status: 'ok',
      model: 'claude-opus-5-5',
      exitCode: 0,
      turns: 4,
      costUsd: 0.1834,
      error: null,
      named: true,
      mentions: ['burgee'],
      citedUrls: ['https://burgee.interlace.tools/', 'https://github.com/tj/commander.js'],
      ours: ['https://burgee.interlace.tools/'],
    });
    expect(probeProblems(run)).toEqual([]);

    // One spawn per question, in order, with the question as the prompt — and never with
    // ANTHROPIC_API_KEY in the child's environment.
    const calls = stub.calls();
    expect(calls).toHaveLength(5);
    expect(calls.map((c, i) => c.startsWith(`-p ${QUESTIONS[i]} `))).toEqual([true, true, true, true, true]);
    expect(calls.every((c) => c.endsWith('|key='))).toBe(true);
  });

  it('records a non-zero exit as error with the exit code, and does not throw', () => {
    const stub = stubClaude(`echo 'Invalid API key · Please run /login' >&2\nexit 1`);
    const run = runProbe({ env: TOKEN, date: DATE, commit: SHA, claudeBin: stub.bin, notice: quiet });
    expect(run.observations.map((o) => [o.status, o.exitCode])).toEqual(Array.from({ length: 5 }, () => ['error', 1]));
    expect(run.observations[0]?.error).toContain('Invalid API key');
    expect(run.assistants.claude.status).toBe('ran');
    expect(probeProblems(run)).toEqual([]);

    // The shape the real CLI (2.1.145) gives with no working login: exit 1, the reason in JSON on stdout.
    const unauthenticated = printing({ type: 'result', subtype: 'success', is_error: true, num_turns: 1, result: 'Not logged in · Please run /login', total_cost_usd: 0, modelUsage: {} }, 1);
    const denied = runProbe({ env: TOKEN, date: DATE, commit: SHA, claudeBin: unauthenticated.bin, notice: quiet });
    expect(denied.observations[0]).toMatchObject({ status: 'error', exitCode: 1, model: null, named: false });
    expect(denied.observations[0]?.error).toContain('Not logged in');
    expect(probeProblems(denied)).toEqual([]);
  });

  it('records output that is not JSON as error, and does not throw', () => {
    const stub = stubClaude(`echo 'this is not json'`);
    const run = runProbe({ env: TOKEN, date: DATE, commit: SHA, claudeBin: stub.bin, notice: quiet });
    expect(run.observations.every((o) => o.status === 'error' && o.exitCode === 0 && o.error?.startsWith('output is not JSON'))).toBe(true);
    expect(probeProblems(run)).toEqual([]);
  });

  it('records a CLI-reported error (max turns) as error, keeping the model and cost', () => {
    const stub = printing({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 11, total_cost_usd: 0.4, modelUsage: { 'claude-opus-5-5': { outputTokens: 10 } } });
    const run = runProbe({ env: TOKEN, date: DATE, commit: SHA, claudeBin: stub.bin, notice: quiet });
    expect(run.observations[0]).toMatchObject({ status: 'error', model: 'claude-opus-5-5', turns: 11, costUsd: 0.4, named: false, citedUrls: [] });
    expect(run.observations[0]?.error).toContain('error_max_turns');
    expect(probeProblems(run)).toEqual([]);
  });

  it('records a missing binary and a timeout as error with no exit code', () => {
    const missing = runProbe({ env: TOKEN, date: DATE, commit: SHA, claudeBin: join(tmpdir(), 'no-such-claude-binary'), notice: quiet });
    expect(missing.observations.every((o) => o.status === 'error' && o.exitCode === null && o.error?.includes('ENOENT'))).toBe(true);

    const slow = stubClaude('sleep 5');
    const timedOut = runProbe({ env: TOKEN, date: DATE, commit: SHA, claudeBin: slow.bin, timeoutMs: 200, notice: quiet });
    expect(timedOut.observations.every((o) => o.status === 'error' && o.exitCode === null && o.error?.includes('ETIMEDOUT'))).toBe(true);
    expect(probeProblems(timedOut)).toEqual([]);
  });
});

describe('the claude invocation', () => {
  it('asks the question in print mode, JSON out, pinned model, web tools only, capped turns, isolated', () => {
    expect(claudeArgs('Q?')).toEqual([
      '-p',
      'Q?',
      '--output-format',
      'json',
      '--model',
      MODEL,
      '--tools',
      'WebSearch,WebFetch',
      '--allowedTools',
      'WebSearch,WebFetch',
      '--max-turns',
      String(MAX_TURNS),
      '--no-session-persistence',
      '--setting-sources',
      'project,local',
      '--strict-mcp-config',
    ]);
  });

  it('parseClaudeOutput treats a result with no text as an error, not an empty answer', () => {
    expect(parseClaudeOutput(JSON.stringify({ is_error: false, num_turns: 1 }), 0)).toMatchObject({ ok: false, turns: 1 });
    expect(parseClaudeOutput('[1,2]', 0)).toMatchObject({ ok: false, error: expect.stringContaining('not a JSON object') });
  });

  it('answeringModel picks the model that wrote the most, and tolerates junk', () => {
    expect(answeringModel(success('x').modelUsage)).toBe('claude-opus-5-5');
    expect(answeringModel({})).toBeNull();
    expect(answeringModel(null)).toBeNull();
    expect(answeringModel({ a: 'junk' })).toBe('a');
  });
});

describe('probeProblems', () => {
  it('rejects a run that is missing observations, has the wrong questions, or claims an answer it skipped', () => {
    const run = runProbe({ env: {}, date: DATE, commit: SHA, notice: quiet });
    expect(probeProblems({ ...run, observations: run.observations.slice(1) })).not.toEqual([]);
    expect(probeProblems({ ...run, questions: [...QUESTIONS].reverse() })).toContain('questions are not the five fixed questions');
    expect(probeProblems({ ...run, commit: 'abc' })).toContain('commit is not a full 40-character sha');
    const lying = run.observations.map((o, i) => (i === 0 ? { ...o, named: true, mentions: ['burgee'] } : o));
    expect(probeProblems({ ...run, observations: lying }).join('\n')).toContain('is skipped but records an answer');
  });

  it('rejects a v1 run: three assistants and an httpStatus', () => {
    const run = runProbe({ env: {}, date: DATE, commit: SHA, notice: quiet });
    expect(probeProblems({ ...run, v: 1 })).toContain('v is not 2');
    const v1 = run.observations.map((o) => ({ ...o, assistant: 'openai' }));
    expect(probeProblems({ ...run, observations: v1 }).join('\n')).toContain('assistant is not claude');
  });

  it('holds every committed run file to the current shape and names it for its date', () => {
    const dir = join(REPO_ROOT, PROBE_DIR);
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const doc = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { date?: string };
      expect(probeProblems(doc), file).toEqual([]);
      expect(file, file).toBe(`${doc.date}.json`);
    }
  });
});

describe('.github/workflows/citation-probe.yml', () => {
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/citation-probe.yml'), 'utf8');

  it('runs weekly and on dispatch, installs Claude Code, and hands the probe only CLAUDE_CODE_OAUTH_TOKEN', () => {
    expect(workflow).toContain('schedule:');
    expect(workflow).toMatch(/- cron: "[^"]+"/);
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('npm install --global @anthropic-ai/claude-code');
    expect(workflow).toContain('CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}');
    expect([...workflow.matchAll(/\$\{\{ secrets\.([A-Z_]+)/g)].map((m) => m[1]).filter((s) => !s?.startsWith('RELEASE_'))).toEqual(['CLAUDE_CODE_OAUTH_TOKEN']);
    for (const removed of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'PERPLEXITY_API_KEY']) expect(workflow).not.toContain(removed);
    expect(workflow).toContain('npx tsx scripts/citation-probe.ts');
  });

  it('lands the file through the same token fallback as evals.yml', () => {
    for (const needle of [
      "HAS_APP_KEY: ${{ secrets.RELEASE_APP_PRIVATE_KEY != '' }}",
      "HAS_PAT: ${{ secrets.RELEASE_BOT_PAT != '' }}",
      'actions/create-github-app-token@',
      'GH_TOKEN: ${{ steps.app.outputs.token || secrets.RELEASE_BOT_PAT || github.token }}',
      'https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git',
      '--label skip-changeset',
      'gh pr merge --auto --squash',
    ]) {
      expect(workflow, needle).toContain(needle);
    }
  });
});
