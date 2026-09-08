/** cli-mcp's second slice on the engine: N7 changed, N11 action required, N12 agent detection, N13 the schema budget. */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, detectAgent, execute, type RunOptions, summaryOf } from './index.js';
import { runBurgee } from './testing.js';

describe('agent detection, not just isTTY (N12)', () => {
  it('names the agent from the environment and turns interaction off, terminal or not', () => {
    expect(detectAgent({ CLAUDECODE: '1' }, true)).toEqual({ agent: 'claude-code', interactive: false });
    expect(detectAgent({ CURSOR_AGENT: '1' }, false)).toEqual({ agent: 'cursor', interactive: false });
    expect(detectAgent({ AI_AGENT: '1' }, true)).toEqual({ agent: 'generic', interactive: false });
    expect(detectAgent({ AI_AGENT: 'devin' }, true)).toEqual({ agent: 'devin', interactive: false });
  });
  it('FORCE_TTY=1 overrides; a terminal with no agent is interactive; no terminal is not', () => {
    expect(detectAgent({ CLAUDECODE: '1', FORCE_TTY: '1' }, true)).toMatchObject({ interactive: true });
    expect(detectAgent({}, true)).toEqual({ interactive: true });
    expect(detectAgent({}, false)).toEqual({ interactive: false });
  });
  it('reaches the handler as ctx.interactive and ctx.agent, from the injected stdout', async () => {
    const seen: unknown[] = [];
    const program = defineProgram({ name: 'app', commands: [defineCommand({ name: 'x', run: ({ interactive, agent }) => void seen.push({ interactive, agent }) })] });
    const base: RunOptions = { argv: ['x'], stderr: { write: () => true }, exit: () => undefined };
    await execute(program, { ...base, env: {}, stdout: { write: () => true, isTTY: true } });
    await execute(program, { ...base, env: { GEMINI_CLI: '1' }, stdout: { write: () => true, isTTY: true } });
    expect(seen).toEqual([{ interactive: true, agent: undefined }, { interactive: false, agent: 'gemini' }]);
  });
});

const program = defineProgram({
  name: 'app',
  schemaBudget: 200,
  commands: [
    defineCommand({ name: 'sync', effects: 'idempotent', run: () => ({ changed: false, files: 0 }) }),
    defineCommand({ name: 'silent', effects: 'idempotent', run: () => ({ files: 0 }) }),
    defineCommand({ name: 'status', effects: 'read_only', run: () => 'fine' }),
    defineCommand({
      name: 'deploy',
      description: 'Ship a build',
      effects: 'non_idempotent',
      options: { target: { type: 'string', required: true } },
      run: ({ actionRequired, interactive }) => {
        if (!interactive) actionRequired({ reason: 'confirm', message: 'deploying to prod needs confirmation', next: [{ command: 'deploy --target prod --yes', when: 'once you have reviewed the plan' }], hint: 'pass --yes to skip the prompt' });
        return 'deployed';
      },
    }),
  ],
});

describe('a no-op announces itself (N7)', () => {
  it('carries changed from an idempotent command into the envelope', async () => {
    const r = await runBurgee(program, { argv: ['sync', '--json'] });
    expect(r.json).toMatchObject({ ok: true, data: { changed: false }, meta: { changed: false } });
  });
  it('fails an idempotent command that stays silent, and leaves read-only ones alone', async () => {
    const r = await runBurgee(program, { argv: ['silent'] });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/"silent" is idempotent and must report changed/);
    expect((await runBurgee(program, { argv: ['status'] })).code).toBe(0);
  });
});

describe('the action-required envelope (N11)', () => {
  it('under --json: status, reason, message, runnable next[] carrying the caller\'s --json, hint; exit CANCELLED (4)', async () => {
    const r = await runBurgee(program, { argv: ['deploy', '--target', 'prod', '--json'] });
    expect(r.code).toBe(4);
    expect(r.json).toMatchObject({
      ok: false,
      status: 'action_required',
      reason: 'confirm',
      message: 'deploying to prod needs confirmation',
      next: [{ command: 'app deploy --target prod --yes --json', when: 'once you have reviewed the plan' }],
      hint: 'pass --yes to skip the prompt',
    });
  });
  it('as text: the reason, the message, the next commands and the hint', async () => {
    const r = await runBurgee(program, { argv: ['deploy', '--target', 'prod'] });
    expect(r.code).toBe(4);
    expect(r.stderr).toBe('action required (confirm): deploying to prod needs confirmation\nnext:\n  app deploy --target prod --yes    once you have reviewed the plan\nhint: pass --yes to skip the prompt\n');
  });
});

describe('--schema under a budget (N13)', () => {
  it('summarises above the budget, names every command, and says how to drill', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    const summary = JSON.parse(r.stdout) as { summarised: boolean; budget: number; commands: { name: string; effects?: string }[]; hint: string };
    expect(summary).toMatchObject({ summarised: true, budget: 200 });
    expect(summary.commands.map((c) => c.name)).toEqual(['sync', 'silent', 'status', 'deploy']);
    expect(summary.hint).toBe('run `app <command> --schema` for one command in full');
    expect(summary).toEqual(summaryOf(program, 200));
  });
  it('drills into one command in full', async () => {
    const r = await runBurgee(program, { argv: ['deploy', '--schema'] });
    expect(JSON.parse(r.stdout)).toMatchObject({ name: 'deploy', effects: 'non_idempotent', inputSchema: { required: ['target'] } });
  });
});
