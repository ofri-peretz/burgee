import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { type Shell, type Worktrees } from './run.js';

import { CASES, HISTORY, program, readCases, runCheck, runPropose, runReplay, VERSION } from './index.js';

const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();

const CONFIG = `reviewer: review
grader: grade {model}
model: cheap
maxFindings: 3
stages: [raw, final]
checks:
  - { id: types, command: tsc }
`;

const BUG = 'id: bug-1\nkind: bug\npr: 1\nbase: aaaaaaa\nhead: bbbbbbb\nanswer: The key drops the locale.\nset: test\n';
const CONTROL = 'id: control-2\nkind: control\npr: 2\nbase: aaaaaaa\nhead: ccccccc\nset: tune\n';

const scratch = scratchDirs();

const folder = (files: Record<string, string>): string => {
  const dir = scratch('replay-');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
};

const REPO = { '.sdlc/replz/config.yaml': CONFIG, '.sdlc/replz/cases/bug-1.yaml': BUG, '.sdlc/replz/cases/control-2.yaml': CONTROL, '.sdlc/replz/cases/README.md': 'not a case' };

const shell: Shell = (command, options) => {
  if (command === 'review') return Promise.resolve({ code: 0, stdout: JSON.stringify([{ stage: 'final', severity: 'must-fix', text: 'locale', item: 'spawn' }]), stderr: '' });
  if (command === 'tsc') return Promise.resolve({ code: options.env?.REPLZ_PR === '1' ? 1 : 0, stdout: '', stderr: '' });
  return Promise.resolve({ code: 0, stdout: command === 'grade pricey' ? 'no' : 'yes', stderr: '' });
};
const worktrees: Worktrees = { add: (ref) => Promise.resolve({ dir: `/t/${ref}`, remove: () => Promise.resolve() }) };
const now = () => new Date('2026-11-23T10:00:00Z');

describe('readCases', () => {
  it('reads every yaml case in the folder, by file name', () => {
    expect(readCases(folder(REPO), CASES).map((found) => found.id)).toEqual(['bug-1', 'control-2']);
  });
});

describe('runCheck', () => {
  it('counts each set, the checks and the stages', () => {
    const data = runCheck({ repo: folder(REPO), config: '.sdlc/replz/config.yaml', cases: CASES });
    expect(JSON.parse(JSON.stringify(data))).toEqual({ cases: 2, sets: { tune: { bugs: 0, controls: 1 }, test: { bugs: 1, controls: 0 } }, checks: 1, stages: ['raw', 'final'] });
    expect(text(data)).toBe('2 case(s): tune 0 bug(s) + 1 control(s), test 1 bug(s) + 0 control(s); 1 check(s); stages raw > final');
  });
});

describe('runReplay', () => {
  const base = { config: '.sdlc/replz/config.yaml', cases: CASES, shell, worktrees, now };

  it('replays every case, scores it, and records the run when asked', async () => {
    const repo = folder({ ...REPO, 'list.yaml': 'items:\n  - { id: spawn }\n  - { id: quiet }\n' });
    writeFileSync(join(repo, '.sdlc/replz/config.yaml'), `${CONFIG}checklist: list.yaml\n`);
    const data = await runReplay({ ...base, repo, record: true });
    expect(data).toMatchObject({ date: '2026-11-23', set: 'all', model: 'cheap', maxFindings: 3, cases: ['bug-1', 'control-2'], recorded: true });
    expect(data.report).toMatchObject({ bugs: 1, controls: 1, recall: [{ stage: 'raw', found: 0 }, { stage: 'final', found: 1 }], falseAlarms: 1, neverFired: ['quiet'] });
    expect(text(data)).toMatch(/\n\nrecorded in \.sdlc\/replz\/history\.jsonl$/);
    const line = JSON.parse(readFileSync(join(repo, HISTORY), 'utf8')) as Record<string, unknown>;
    expect(line).toEqual(JSON.parse(JSON.stringify({ ...data, recorded: undefined })));
    await runReplay({ ...base, repo, record: true });
    expect(readFileSync(join(repo, HISTORY), 'utf8').split('\n')).toHaveLength(3);
  });

  it('takes the set, model and cap from options over the config, and records nothing by default', async () => {
    const repo = folder(REPO);
    const data = await runReplay({ ...base, repo, record: false, set: 'test', model: 'pricey', maxFindings: 1 });
    expect(data).toMatchObject({ set: 'test', model: 'pricey', maxFindings: 1, cases: ['bug-1'], recorded: false });
    expect(data.report).toMatchObject({ recall: [{ stage: 'raw', found: 0 }, { stage: 'final', found: 0 }], neverFired: [] });
    expect(text(data)).not.toContain('recorded');
    expect(() => readFileSync(join(repo, HISTORY))).toThrow();
  });
});

describe('runPropose', () => {
  it('drafts case files from the log', async () => {
    const log = '\0b1aaaaaaaaaaaaa\tp1\tRevert "feat: x (#5)"\t\u0001\n\0b2aaaaaaaaaaaaa\tp2\tfeat: x (#5)\t\u0001\n 1 file changed, 4 insertions(+)\n\0b3aaaaaaaaaaaaa\tp3\tfeat: y (#6)\t\u0001\n 1 file changed, 3 insertions(+)\n';
    const asked: string[][] = [];
    const data = await runPropose({ repo: '/r', ref: 'main', limit: 5, log: (repo, args) => {
        asked.push([repo, ...args]);
        return Promise.resolve(log);
      },
    });
    expect(asked[0]?.slice(0, 2)).toEqual(['/r', 'log']);
    expect(asked[0]?.at(-1)).toBe('main');
    expect(data).toMatchObject({ bugs: 1, controls: 1, drafts: [{ file: '.sdlc/replz/cases/bug-5.yaml' }, { file: '.sdlc/replz/cases/control-6.yaml' }] });
    expect(text(data)).toMatch(/^--- \.sdlc\/replz\/cases\/bug-5\.yaml\n# feat: x \(#5\)\n/);
    expect(text(data)).toContain('\n--- .sdlc/replz/cases/control-6.yaml\n# feat: y (#6)\n');
  });

  it('says when nothing on the ref names a pull request', async () => {
    const data = await runPropose({ repo: '/r', ref: 'main', limit: 5, log: () => Promise.resolve('') });
    expect(text(data)).toBe('no revert or fix on main names a pull request. fix: write cases by hand from the incident ledger');
  });
});

describe('the program', () => {
  it('declares its version and commands, with run marked as not idempotent', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    const { commands } = JSON.parse(r.stdout) as { commands: { name: string; effects: string }[] };
    expect(Object.fromEntries(commands.map((c) => [c.name, c.effects]))).toEqual({ check: 'read_only', run: 'non_idempotent', propose: 'read_only', completion: 'read_only' });
    expect((await runBurgee(program, { argv: ['--version'] })).stdout).toContain(VERSION);
  });

  it('check reads the defaults under --repo', async () => {
    const r = await runBurgee(program, { argv: ['check', '--repo', folder(REPO), '--json'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.json).toMatchObject({ data: { cases: 2 } });
  });

  it('run and propose reach git through --repo, and fail with its message outside a repository', async () => {
    const repo = folder(REPO);
    const run = await runBurgee(program, { argv: ['run', '--repo', repo, '--set', 'test', '--model', 'm', '--max-findings', '2', '--record', '--json'] });
    expect(run.code).toBe(ExitCode.RUNTIME);
    expect(JSON.stringify(run.json)).toContain('git worktree add --detach');
    expect(JSON.stringify(run.json)).toContain('bbbbbbb failed: fatal');
    const proposed = await runBurgee(program, { argv: ['propose', '--repo', repo, '--json'] });
    expect(proposed.code).toBe(ExitCode.RUNTIME);
    expect(JSON.stringify(proposed.json)).toContain('origin/main failed: fatal');
  });
});
