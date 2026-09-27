/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The citation probe's run: skipped without a key, `error` on a failed call, scored on a
 * good one, always one observation per (assistant, question), and always the roadmap's five
 * questions. The network is a stub in every test; nothing here reaches a provider.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { PROBE_DIR, probeProblems, QUESTIONS, runProbe, writeProbe } from './citation-probe';
import { readClaude, readOpenAI, readPerplexity } from './citation-probe-assistants';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567';
const DATE = '2026-09-24';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that fails the test if anything calls it. */
const noNetwork = vi.fn<typeof fetch>(() => {
  throw new Error('the probe made a network call in a test');
});

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

describe('runProbe with no keys', () => {
  it('skips every assistant loudly, makes no call, and writes a valid all-skipped run', async () => {
    const notices: string[] = [];
    const run = await runProbe({ env: {}, date: DATE, commit: SHA, fetchImpl: noNetwork, notice: (l) => notices.push(l) });

    expect(noNetwork).not.toHaveBeenCalled();
    expect(notices).toHaveLength(3);
    for (const secret of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'PERPLEXITY_API_KEY']) {
      expect(notices.some((n) => n.startsWith('::notice') && n.includes(secret)), secret).toBe(true);
    }
    expect(Object.values(run.assistants).map((a) => a.status)).toEqual(['skipped', 'skipped', 'skipped']);
    expect(run.observations).toHaveLength(15);
    expect(run.observations.every((o) => o.status === 'skipped' && !o.named && o.model === null)).toBe(true);
    expect(probeProblems(run)).toEqual([]);

    const root = mkdtempSync(join(tmpdir(), 'citation-probe-'));
    const rel = writeProbe(run, root);
    expect(rel).toBe(`${PROBE_DIR}/${DATE}.json`);
    expect(probeProblems(JSON.parse(readFileSync(join(root, rel), 'utf8')))).toEqual([]);
  });

  it('treats an empty or blank key as missing', async () => {
    const run = await runProbe({ env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '  ' }, date: DATE, commit: SHA, fetchImpl: noNetwork, notice: () => {} });
    expect(run.assistants.claude.status).toBe('skipped');
    expect(run.assistants.openai.status).toBe('skipped');
    expect(noNetwork).not.toHaveBeenCalled();
  });
});

describe('runProbe with a key', () => {
  it('records a failing call as error with its HTTP status, and does not throw', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ error: { type: 'authentication_error' } }, 401));
    const run = await runProbe({ env: { OPENAI_API_KEY: 'sk-test' }, date: DATE, commit: SHA, fetchImpl, notice: () => {} });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    const mine = run.observations.filter((o) => o.assistant === 'openai');
    expect(mine.map((o) => [o.status, o.httpStatus])).toEqual(Array.from({ length: 5 }, () => ['error', 401]));
    expect(mine[0]?.error).toContain('authentication_error');
    expect(run.assistants.openai.status).toBe('ran');
    expect(probeProblems(run)).toEqual([]);
  });

  it('records a network failure as error with no HTTP status', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    const run = await runProbe({ env: { PERPLEXITY_API_KEY: 'pplx' }, date: DATE, commit: SHA, fetchImpl, notice: () => {} });
    const mine = run.observations.filter((o) => o.assistant === 'perplexity');
    expect(mine.every((o) => o.status === 'error' && o.httpStatus === null && o.error?.includes('fetch failed'))).toBe(true);
    expect(probeProblems(run)).toEqual([]);
  });

  it('scores a Claude answer: model, named, cited URLs and ours', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        content: [
          { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'commander alternative' } },
          { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://example.com/list', title: 'x' }] },
          {
            type: 'text',
            text: 'burgee is a drop-in for commander.',
            citations: [{ type: 'web_search_result_location', url: 'https://burgee.interlace.tools/', title: 'burgee', cited_text: '…', encrypted_index: 'x' }],
          },
          { type: 'text', text: ' Also see https://github.com/tj/commander.js.' },
        ],
      }),
    );
    const run = await runProbe({ env: { ANTHROPIC_API_KEY: 'sk-ant' }, date: DATE, commit: SHA, fetchImpl, notice: () => {} });
    const first = run.observations.find((o) => o.assistant === 'claude' && o.question === 1);
    expect(first).toMatchObject({
      status: 'ok',
      model: 'claude-opus-5-5',
      named: true,
      mentions: ['burgee'],
      citedUrls: ['https://burgee.interlace.tools/', 'https://github.com/tj/commander.js'],
      ours: ['https://burgee.interlace.tools/'],
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'claude-opus-5-5', tools: [{ type: 'web_search_20260209', name: 'web_search' }] });
    expect(probeProblems(run)).toEqual([]);
  });

  it('resumes a paused Claude turn and keeps both halves of the answer', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ model: 'claude-opus-5-5', stop_reason: 'pause_turn', content: [{ type: 'text', text: 'Searching. ' }] }))
      .mockImplementation(async () => json({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Use `closeout`.' }] }));
    const run = await runProbe({ env: { ANTHROPIC_API_KEY: 'sk-ant' }, date: DATE, commit: SHA, fetchImpl, notice: () => {} });
    const first = run.observations.find((o) => o.assistant === 'claude' && o.question === 1);
    expect(first).toMatchObject({ status: 'ok', named: true, mentions: ['closeout'] });
    const resumed = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)) as { messages: { role: string }[] };
    expect(resumed.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('records a Claude refusal as an error, not an unnamed answer', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ model: 'claude-opus-5-5', stop_reason: 'refusal', content: [] }));
    const run = await runProbe({ env: { ANTHROPIC_API_KEY: 'sk-ant' }, date: DATE, commit: SHA, fetchImpl, notice: () => {} });
    expect(run.observations.find((o) => o.assistant === 'claude')).toMatchObject({ status: 'error', httpStatus: 200, error: 'stop_reason: refusal' });
  });
});

describe('the response readers', () => {
  it('readOpenAI takes output_text and url_citation annotations from message items', () => {
    expect(
      readOpenAI([
        { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: 'q' } },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Try burgee.', annotations: [{ type: 'url_citation', start_index: 4, end_index: 10, url: 'https://www.npmjs.com/package/burgee', title: 't' }] }],
        },
      ]),
    ).toEqual({ text: 'Try burgee.', citedUrls: ['https://www.npmjs.com/package/burgee'] });
  });

  it('readPerplexity takes search_results URLs and message text', () => {
    expect(
      readPerplexity([
        { type: 'search_results', results: [{ id: 1, url: 'https://ofriperetz.dev/x', title: 't', snippet: 's', date: 'd', source: 'web' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Use yargs [1].', annotations: [] }] },
      ]),
    ).toEqual({ text: 'Use yargs [1].', citedUrls: ['https://ofriperetz.dev/x'] });
  });

  it('readClaude ignores blocks that are not text and tolerates a missing citations array', () => {
    expect(readClaude([{ type: 'server_tool_use' }, { type: 'text', text: 'a' }, null, 'junk'])).toEqual({ text: 'a', citedUrls: [] });
  });
});

describe('probeProblems', () => {
  it('rejects a run that is missing observations, has the wrong questions, or claims an answer it skipped', async () => {
    const run = await runProbe({ env: {}, date: DATE, commit: SHA, fetchImpl: noNetwork, notice: () => {} });
    expect(probeProblems({ ...run, observations: run.observations.slice(1) })).not.toEqual([]);
    expect(probeProblems({ ...run, questions: [...QUESTIONS].reverse() })).toContain('questions are not the five fixed questions');
    expect(probeProblems({ ...run, commit: 'abc' })).toContain('commit is not a full 40-character sha');
    const lying = run.observations.map((o, i) => (i === 0 ? { ...o, named: true, mentions: ['burgee'] } : o));
    expect(probeProblems({ ...run, observations: lying }).join('\n')).toContain('is skipped but records an answer');
  });

  it('holds every committed run file to the v1 shape and names it for its date', () => {
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

  it('runs weekly and on dispatch, and hands the probe all three secrets', () => {
    expect(workflow).toContain('schedule:');
    expect(workflow).toMatch(/- cron: "[^"]+"/);
    expect(workflow).toContain('workflow_dispatch:');
    for (const secret of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'PERPLEXITY_API_KEY']) expect(workflow).toContain(`\${{ secrets.${secret} }}`);
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
