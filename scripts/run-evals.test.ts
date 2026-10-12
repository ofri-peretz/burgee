import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { brokenLinks, callLines, claudeArgs, DEFAULT_MAX_TURNS, grade, missingScripts, billingFor, STORED_LOGIN_OPT_IN, storedLogin, transcriptOf, unknownFloorIds, whyFailed } from './run-evals';

/** A throwaway repo root with one doc, so each checker is exercised on a known tree. */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'evals-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

describe('layer 1 — links', () => {
  it('reports a relative link to nothing, and one that escapes the repo', () => {
    const root = repo({ 'docs/a.md': '[x](./missing.md) [y](../../outside.md) [ok](./a.md)' });
    expect(brokenLinks(['docs/a.md'], root)).toEqual([
      'docs/a.md → ./missing.md',
      'docs/a.md → ../../outside.md (outside the repository — dangles in a clone)',
    ]);
  });

  it('ignores links inside code, anchors and URLs', () => {
    const root = repo({ 'docs/a.md': '`[x](./nope.md)` [h](#top) [u](https://x.y/z)\n```\n[c](./nope.md)\n```' });
    expect(brokenLinks(['docs/a.md'], root)).toEqual([]);
  });
});

describe('layer 1 — scripts', () => {
  it('reports script files and npm scripts that do not exist', () => {
    const root = repo({
      'package.json': JSON.stringify({ scripts: { test: 'x' } }),
      'scripts/real.ts': '',
      'docs/a.md': 'run scripts/real.ts then scripts/gone.ts, or npm run test, or npm run gone',
    });
    expect(missingScripts(['docs/a.md'], root)).toEqual(['docs/a.md → scripts/gone.ts', 'docs/a.md → npm run gone']);
  });
});

describe('layer 1 — floor ids', () => {
  it('reports an id a child cites that the umbrella does not define', () => {
    const root = repo({
      '.sdlc/intents/burgee/spec.md': '| F1 | x | R |\n| K5 | y | lock |',
      '.sdlc/intents/child/intent.md': 'needs F1 and K5 and Z9 and F99',
    });
    expect(unknownFloorIds(root)).toEqual(['.sdlc/intents/child/intent.md → F99']);
  });

  it('is clean on this repository', () => {
    expect(unknownFloorIds()).toEqual([]);
  });
});

describe('layer 2 — grading and billing', () => {
  it('grades contains / omits case-insensitively', () => {
    expect(grade('Hello World', [{ check: 'output-contains', value: 'hello' }]).ok).toBe(true);
    expect(grade('Hello World', [{ check: 'output-omits', value: 'world' }]).ok).toBe(false);
  });

  it('prefers the subscription token and warns when both are set', () => {
    expect(billingFor({}).billing).toBe('none');
    expect(billingFor({ CLAUDE_CODE_OAUTH_TOKEN: 't' }).billing).toBe('subscription');
    expect(billingFor({ CLAUDE_CODE_OAUTH_TOKEN: 't', ANTHROPIC_API_KEY: 'k' })).toEqual({ billing: 'console', bothSet: true, hasCredential: true });
    expect(billingFor({ ANTHROPIC_API_KEY: '' }).billing).toBe('none');
  });

  it('counts a stored login as a credential, and lets a variable outrank it as claude does', () => {
    expect(billingFor({}, 'subscription')).toEqual({ billing: 'subscription', bothSet: false, hasCredential: true });
    expect(billingFor({ ANTHROPIC_API_KEY: 'k' }, 'subscription').billing).toBe('console');
  });
});

/** A `claude` whose `auth status` answers with `doc` and exits `code`. */
function stubAuth(doc: string, code: number): string {
  const bin = join(mkdtempSync(join(tmpdir(), 'stub-claude-auth-')), 'claude');
  writeFileSync(bin, `#!/bin/sh\ncat <<'JSON'\n${doc}\nJSON\nexit ${String(code)}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

describe.skipIf(process.platform === 'win32')('layer 2 — a stored claude login', () => {
  const on = { [STORED_LOGIN_OPT_IN]: '1', PATH: process.env.PATH };
  const loggedIn = stubAuth(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }), 0);

  it('bills a claude.ai login to the subscription when opted into', () => {
    expect(storedLogin(on, loggedIn)).toBe('subscription');
  });

  // A logged-in claude is the normal state of a developer machine; `npm run evals` must
  // not start spending on it unasked.
  it('is never used unless opted into', () => {
    expect(storedLogin({ PATH: process.env.PATH }, loggedIn)).toBe('none');
  });

  it('is refused when the login has expired or the answer is not JSON', () => {
    expect(storedLogin(on, stubAuth(JSON.stringify({ loggedIn: false, authMethod: 'none' }), 1))).toBe('none');
    expect(storedLogin(on, stubAuth('not json', 0))).toBe('none');
  });
});

describe('turn budget — D-143', () => {
  const authoring = { id: 'x', why: '', prompt: 'p', allowedTools: 'Read,Write,Edit,Bash', expect: [] };
  const cap = (env: NodeJS.ProcessEnv) => Number(claudeArgs(authoring, env)[claudeArgs(authoring, env).indexOf('--max-turns') + 1]);

  it('gives the authoring prompt its four tool steps plus room to repair (D-20261006-eval-turn-budget)', () => {
    expect(DEFAULT_MAX_TURNS).toBe(12);
    expect(cap({})).toBe(12);
  });

  it('still lets EVAL_MAX_TURNS override it', () => {
    expect(cap({ EVAL_MAX_TURNS: '20' })).toBe(20);
  });
});

describe('whyFailed — a failed case says how the agent stopped', () => {
  it('reads the result document: how it ended, after how many turns, and its last words', () => {
    const doc = JSON.stringify({ type: 'result', subtype: 'error_max_turns', num_turns: 8, result: 'I need permission\nto write evals/results/asdf-plugin.mjs.' });
    expect(whyFailed(doc)).toBe('agent stopped: error_max_turns after 8 turn(s) — "I need permission to write evals/results/asdf-plugin.mjs."');
  });

  it('keeps only the end of a long answer', () => {
    const said = whyFailed(JSON.stringify({ subtype: 'success', num_turns: 3, result: `${'x'.repeat(1000)} the end` }));
    expect(said.endsWith('the end"')).toBe(true);
    expect(said.length).toBeLessThan(320);
  });

  it('falls back to stderr when there is no document, and says so when stderr is empty too', () => {
    expect(whyFailed('not json', 'Error: Invalid API key\n')).toBe('agent produced no result document; stderr: Error: Invalid API key');
    expect(whyFailed('', '')).toBe('agent produced no result document; stderr: (empty)');
    expect(whyFailed(JSON.stringify({}))).toBe('agent stopped: unknown after ? turn(s) — ""');
  });
});

/** One `stream-json` event, as `claude` prints it: a line of JSON. */
const event = (e: unknown) => JSON.stringify(e);
const assistant = (id: string, ...content: unknown[]) => event({ type: 'assistant', message: { id, content } });
const toolResult = (id: string, content: unknown, isError = false) => event({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });

describe('transcriptOf — a case keeps where its turns went', () => {
  const doc = event({ type: 'result', subtype: 'error_max_turns', num_turns: 13, result: 'out of turns' });

  it('streams, so the document is the last event and every tool call comes before it', () => {
    const args = claudeArgs({ id: 'x', why: '', prompt: 'p', expect: [] }, {});
    expect(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 3)).toEqual(['--output-format', 'stream-json', '--verbose']);
  });

  it('numbers each call by its model turn and keeps what came back, refusals marked', () => {
    const stream = [
      event({ type: 'system', subtype: 'init' }),
      assistant('m1', { type: 'text', text: 'reading' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'schema.json' } }),
      assistant('m1', { type: 'tool_use', id: 't2', name: 'Write', input: { file_path: 'a.mjs', content: 'export default {}' } }),
      toolResult('t1', [{ type: 'text', text: '{ "title":\n "x" }' }, { type: 'image' }]),
      toolResult('t2', 'File created'),
      'not json',
      '42',
      assistant('m2', { type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'node cli.js check a.mjs' } }, { type: 'tool_use', id: 't4', name: 'Glob', input: { pattern: '**' } }, { type: 'tool_use', id: 't5', name: 'Odd', input: 'raw' }),
      toolResult('t3', 'E_PLUGIN_SCHEMA missing', true),
      toolResult('t9', 'an answer to nothing'),
      event({ type: 'user', message: { content: { not: 'an array' } } }),
      toolResult('t4', { neither: 'string nor array' }),
      doc,
    ].join('\n');
    const { result, calls } = transcriptOf(stream);
    expect(result).toBe(doc);
    expect(calls).toEqual([
      { turn: 1, tool: 'Read', input: 'schema.json', output: '{ "title": "x" }', error: false },
      { turn: 1, tool: 'Write', input: 'a.mjs (17 chars)', output: 'File created', error: false },
      { turn: 2, tool: 'Bash', input: 'node cli.js check a.mjs', output: 'E_PLUGIN_SCHEMA missing', error: true },
      { turn: 2, tool: 'Glob', input: '{"pattern":"**"}', output: '', error: false },
      { turn: 2, tool: 'Odd', input: '"raw"', output: '', error: false },
    ]);
    expect(callLines(calls.slice(1, 4))).toEqual(['turn 1 Write: a.mjs (17 chars) → File created', 'turn 2 Bash ✗: node cli.js check a.mjs → E_PLUGIN_SCHEMA missing', 'turn 2 Glob: {"pattern":"**"}']);
  });

  it('counts a message without an id as a turn of its own, and clips a long output', () => {
    const { calls } = transcriptOf([event({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'x' } }] } }), toolResult('a', 'y'.repeat(1000)), event({ type: 'assistant' })].join('\n'));
    expect(calls[0]?.turn).toBe(1);
    expect(calls[0]?.output).toBe(`${'y'.repeat(400)}…`);
    expect(transcriptOf(event({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b', name: 'X' }] } })).calls[0]?.input).toBe('');
  });

  it('hands output that is not a stream back as the result, so the grade reads what it always read', () => {
    expect(transcriptOf('plain text answer')).toEqual({ result: 'plain text answer', calls: [] });
  });
});

describe('the eval job builds before it runs the cases — D-20261007-eval-builds-first', () => {
  it('runs a packages build step before `run-evals.ts`', () => {
    const workflow = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'evals.yml'), 'utf8');
    const build = workflow.indexOf("npx turbo run build --filter='./packages/*'");
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(workflow.indexOf('npx tsx scripts/run-evals.ts'));
  });
});
