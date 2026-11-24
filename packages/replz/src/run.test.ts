import { describe, expect, it } from 'vitest';

import { type Case } from './cases.js';
import { type Config } from './config.js';
import { gradedFirst, gradePrompt, isYes, replayCase, type Shell, type Worktrees } from './run.js';

const CONFIG: Config = { reviewer: 'review', grader: 'grade --model {model} {model}', model: 'cfg', maxFindings: 2, stages: ['raw', 'final'], checks: [{ id: 'types', command: 'tsc' }, { id: 'lint', command: 'eslint' }] };
const BUG: Case = { id: 'b1', kind: 'bug', pr: 7, base: 'aaaaaaa', head: 'bbbbbbb', answer: 'The key drops the locale.', set: 'test' };
const CONTROL: Case = { id: 'c1', kind: 'control', pr: 8, base: 'aaaaaaa', head: 'ccccccc', set: 'test' };

const FINDINGS = [
  { stage: 'raw', severity: 'must-fix', text: 'locale missing from key' },
  { stage: 'final', severity: 'nit', text: 'naming' },
  { stage: 'final', severity: 'must-fix', text: 'third, past the cap' },
];

interface Call {
  command: string;
  cwd: string;
  env?: Readonly<Record<string, string>> | undefined;
  input?: string | undefined;
}

const fake = (answers: Record<string, { code: number | null; stdout?: string; stderr?: string }>) => {
  const calls: Call[] = [];
  const shell: Shell = (command, options) => {
    calls.push({ command, cwd: options.cwd, env: options.env, input: options.input });
    const answer = answers[command] ?? (options.input?.includes('locale missing') === true ? { code: 0, stdout: 'Yes.' } : { code: 0, stdout: 'no' });
    return Promise.resolve({ code: answer.code, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' });
  };
  const trees: string[] = [];
  const worktrees: Worktrees = {
    add: (ref) => {
      trees.push(`add ${ref}`);
      return Promise.resolve({ dir: `/tree/${ref}`, remove: () => Promise.resolve(void trees.push(`remove ${ref}`)) });
    },
  };
  return { calls, shell, trees, worktrees };
};

const grading = (finding: unknown) => ({ command: 'grade --model cheap cheap', cwd: '/tree/bbbbbbb', env: undefined, input: gradePrompt('The key drops the locale.', finding as never) });
const at = (stage: string) => ({ stage, severity: 'nit' as const, text: stage });

describe('replayCase', () => {
  it('reviews in the head worktree, runs every check, grades each finding up to the cap, and removes the tree', async () => {
    const { calls, shell, trees, worktrees } = fake({ review: { code: 0, stdout: JSON.stringify(FINDINGS) }, tsc: { code: 2 }, eslint: { code: 0 } });
    const result = await replayCase({ shell, worktrees, config: { ...CONFIG, maxFindings: 3 }, model: 'cheap', repo: '/home/repo' }, BUG);
    expect(trees).toEqual(['add bbbbbbb', 'remove bbbbbbb']);
    const env = { REPLZ_BASE: 'aaaaaaa', REPLZ_HEAD: 'bbbbbbb', REPLZ_PR: '7', REPLZ_REPO: '/home/repo' };
    expect(calls).toEqual([
      { command: 'review', cwd: '/tree/bbbbbbb', env, input: undefined },
      { command: 'tsc', cwd: '/tree/bbbbbbb', env, input: undefined },
      { command: 'eslint', cwd: '/tree/bbbbbbb', env, input: undefined },
      // The last stage's findings first, then the raw one.
      grading(FINDINGS[1]),
      grading(FINDINGS[2]),
      grading(FINDINGS[0]),
    ]);
    expect(result).toEqual({
      case: BUG,
      findings: [
        { finding: FINDINGS[0], matches: true },
        { finding: FINDINGS[1], matches: false },
        { finding: FINDINGS[2], matches: false },
      ],
      capped: false,
      fired: { types: true, lint: false },
    });
  });

  it('spends a low cap on the last stage before any earlier one, and sets no REPLZ_REPO when none is given', async () => {
    const { calls, shell, worktrees } = fake({ review: { code: 0, stdout: JSON.stringify(FINDINGS) } });
    const result = await replayCase({ shell, worktrees, config: { ...CONFIG, checks: [] }, model: 'cheap' }, BUG);
    // Strictly: a key set to undefined would still reach the command's environment.
    expect(calls[0]?.env).toStrictEqual({ REPLZ_BASE: 'aaaaaaa', REPLZ_HEAD: 'bbbbbbb', REPLZ_PR: '7' });
    expect(calls.slice(1).map((call) => call.input)).toEqual([gradePrompt('The key drops the locale.', FINDINGS[1] as never), gradePrompt('The key drops the locale.', FINDINGS[2] as never)]);
    // Back in the order the reviewer printed them; the raw one, past the cap, is not graded.
    expect(result.findings).toEqual(FINDINGS.map((finding) => ({ finding, matches: false })));
    expect(result.capped).toBe(true);
  });

  it('runs setup first in the tree, and stops when it fails', async () => {
    const { calls, shell, worktrees } = fake({ install: { code: 0 }, review: { code: 0, stdout: '[]' } });
    await replayCase({ shell, worktrees, config: { ...CONFIG, setup: 'install', checks: [] }, model: 'm' }, BUG);
    expect(calls.map((call) => [call.command, call.cwd, call.env?.REPLZ_HEAD])).toEqual([
      ['install', '/tree/bbbbbbb', 'bbbbbbb'],
      ['review', '/tree/bbbbbbb', 'bbbbbbb'],
    ]);
    const failing = fake({ install: { code: 9, stderr: ' no network \n' } });
    await expect(replayCase({ shell: failing.shell, worktrees: failing.worktrees, config: { ...CONFIG, setup: 'install' }, model: 'm' }, BUG)).rejects.toThrow('setup failed on b1 (exit 9): no network. fix: run it by hand in a worktree at bbbbbbb');
    expect(failing.trees).toEqual(['add bbbbbbb', 'remove bbbbbbb']);
  });

  it('needs a model when the grader takes one, and not otherwise', async () => {
    const { shell, worktrees, calls, trees } = fake({ review: { code: 0, stdout: JSON.stringify(FINDINGS.slice(0, 1)) } });
    await expect(replayCase({ shell, worktrees, config: CONFIG, model: undefined }, BUG)).rejects.toThrow('the grader command takes {model} and none was given. fix: pass --model with the cheapest current model, or set model in the replz config');
    // Before anything runs, so the review is not paid for.
    expect([calls, trees]).toEqual([[], []]);
    const control = fake({ review: { code: 0, stdout: '[]' } });
    expect((await replayCase({ shell: control.shell, worktrees: control.worktrees, config: CONFIG, model: undefined }, { ...BUG, kind: 'control', answer: undefined })).findings).toEqual([]);
    const fixed = fake({ review: { code: 0, stdout: JSON.stringify(FINDINGS.slice(0, 1)) }, 'grade fixed': { code: 0, stdout: 'yes' } });
    const result = await replayCase({ shell: fixed.shell, worktrees: fixed.worktrees, config: { ...CONFIG, grader: 'grade fixed', checks: [] }, model: undefined }, BUG);
    expect(result.findings[0]?.matches).toBe(true);
  });

  it('is not capped at exactly the cap', async () => {
    const { shell, worktrees } = fake({ review: { code: 0, stdout: JSON.stringify(FINDINGS.slice(0, 2)) } });
    expect((await replayCase({ shell, worktrees, config: CONFIG, model: 'm' }, BUG)).capped).toBe(false);
  });

  it('never grades a control', async () => {
    const { calls, shell, worktrees } = fake({ review: { code: 0, stdout: JSON.stringify(FINDINGS) } });
    const result = await replayCase({ shell, worktrees, config: { ...CONFIG, checks: [] }, model: 'm' }, CONTROL);
    expect(calls.map((call) => call.command)).toEqual(['review']);
    expect(result).toEqual({ case: CONTROL, findings: FINDINGS.map((finding) => ({ finding, matches: false })), capped: false, fired: {} });
  });

  it('fails when the reviewer fails, and still removes the tree', async () => {
    const { shell, trees, worktrees } = fake({ review: { code: 1, stderr: ' boom \n' } });
    await expect(replayCase({ shell, worktrees, config: CONFIG, model: 'm' }, BUG)).rejects.toThrow('the reviewer failed on b1 (exit 1): boom. fix: run it by hand in a worktree at bbbbbbb');
    expect(trees).toEqual(['add bbbbbbb', 'remove bbbbbbb']);
  });

  it('fails when the grader fails', async () => {
    const { shell, worktrees } = fake({ review: { code: 0, stdout: JSON.stringify(FINDINGS) }, 'grade --model m m': { code: null, stderr: ' killed \n' } });
    await expect(replayCase({ shell, worktrees, config: { ...CONFIG, checks: [] }, model: 'm' }, BUG)).rejects.toThrow('the grader failed (exit null): killed. fix: check the grader command in the replz config');
  });
});

describe('gradedFirst', () => {
  it('takes the last stage first, then each earlier stage, each in printed order, up to the cap', () => {
    const findings = [at('raw'), at('final'), at('mid'), at('raw'), at('final'), at('mid')];
    expect(gradedFirst(findings, ['raw', 'mid', 'final'], 10)).toEqual([1, 4, 2, 5, 0, 3]);
    expect(gradedFirst(findings, ['raw', 'mid', 'final'], 3)).toEqual([1, 4, 2]);
    expect(gradedFirst(findings, ['raw', 'mid', 'final'], 0)).toEqual([]);
    expect(gradedFirst([], ['raw'], 3)).toEqual([]);
  });
});

describe('isYes', () => {
  it.each([
    ['yes', true],
    ['Yes.', true],
    ['  YES, it does', true],
    ['**yes**', true],
    ['yesterday', false],
    ['no', false],
    ['no, yes', false],
    ['', false],
  ])('%j is %s', (answer, expected) => {
    expect(isYes(answer)).toBe(expected);
  });
});

describe('gradePrompt', () => {
  it('gives the answer key, one finding and the question', () => {
    expect(gradePrompt('K.', { stage: 's', severity: 'nit', text: 'F' })).toBe(
      ['You grade a code reviewer against a known bug.', 'The bug (answer key): K.', "The reviewer's finding: F", 'Does the finding describe this bug: the same defect, not merely the same file or area? Answer yes or no, and nothing else.'].join('\n'),
    );
  });
});
