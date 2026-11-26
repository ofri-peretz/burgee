import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { type Shell, type Worktrees } from './run.js';

import { CANDIDATES, CASES, DEFAULT_CANDIDATES, HISTORY, program, readCases, runCheck, runCompare, runMine, runPropose, runReplay, VERSION } from './index.js';

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
const TUNE_BUG = BUG.replaceAll('bug-1', 'bug-3').replace('set: test', 'set: tune');
const TEST_CONTROL = CONTROL.replaceAll('control-2', 'control-4').replace('set: tune', 'set: test');

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

const READY = { ...REPO, '.sdlc/replz/cases/bug-3.yaml': TUNE_BUG, '.sdlc/replz/cases/control-4.yaml': TEST_CONTROL };

describe('readCases', () => {
  it('reads every yaml case in the folder, by file name', () => {
    expect(readCases(folder(REPO), CASES).map((found) => found.id)).toEqual(['bug-1', 'control-2']);
  });

  it('refuses a case file not named by its id, and a folder that is not there', () => {
    expect(() => readCases(folder({ '.sdlc/replz/cases/bug-9.yaml': BUG }), CASES)).toThrow('.sdlc/replz/cases/bug-9.yaml holds the case `bug-1`. fix: rename the file bug-1.yaml, or change its id');
    const empty = folder({});
    expect(() => readCases(empty, CASES)).toThrow(`.sdlc/replz/cases does not exist in ${empty}. fix: run replz in the repository it replays, or pass --repo, or --cases`);
  });
});

describe('runCheck', () => {
  const options = { config: '.sdlc/replz/config.yaml', cases: CASES };

  it('counts each set, the checks and the stages', () => {
    const data = runCheck({ ...options, repo: folder(READY) });
    expect(JSON.parse(JSON.stringify(data))).toEqual({ cases: 4, sets: { tune: { bugs: 1, controls: 1 }, test: { bugs: 1, controls: 1 } }, checks: 1, stages: ['raw', 'final'] });
    expect(text(data)).toBe('4 case(s): tune 1 bug(s) + 1 control(s), test 1 bug(s) + 1 control(s); 1 check(s); stages raw > final');
  });

  it('refuses a set of one kind, naming every kind each set lacks', () => {
    expect(() => runCheck({ ...options, repo: folder(REPO) })).toThrow('the tune set has no bug case; the test set has no control case. fix: add the cases each set lacks (replz propose drafts them), so neither score is of one kind');
    expect(() => runCheck({ ...options, repo: folder({ '.sdlc/replz/config.yaml': CONFIG, '.sdlc/replz/cases/bug-1.yaml': BUG, '.sdlc/replz/cases/control-4.yaml': TEST_CONTROL }) })).toThrow(/^the tune set has no bug case; the tune set has no control case\. fix: /);
  });

  it('refuses an answer still the draft placeholder, and a config that is not there', () => {
    const drafted = folder({ ...READY, '.sdlc/replz/cases/bug-1.yaml': BUG.replace('The key drops the locale.', 'TODO one sentence') });
    expect(() => runCheck({ ...options, repo: drafted })).toThrow(/^\.sdlc\/replz\/cases\/bug-1\.yaml: the answer is still the draft's TODO/);
    const bare = folder({ '.sdlc/replz/cases/bug-1.yaml': BUG });
    expect(() => runCheck({ ...options, repo: bare })).toThrow(`.sdlc/replz/config.yaml does not exist in ${bare}. fix: run replz in the repository it replays, or pass --repo, or --config`);
  });
});

describe('runReplay', () => {
  const base = { config: '.sdlc/replz/config.yaml', cases: CASES, shell, worktrees, now };

  it('replays every case, scores it, and records the run when asked', async () => {
    const repo = folder({ ...REPO, 'list.yaml': 'items:\n  - { id: spawn }\n  - { id: quiet }\n' });
    writeFileSync(join(repo, '.sdlc/replz/config.yaml'), `${CONFIG}checklist: list.yaml\n`);
    const data = await runReplay({ ...base, repo, record: true, worktrees: { add: (ref) => Promise.resolve({ dir: `/t/${ref}`, remove: () => Promise.resolve() }) }, shell: (command, options) => {
      if (command === 'review') expect(options.env?.REPLZ_REPO).toBe(repo);
      return shell(command, options);
    } });
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
    expect(Object.fromEntries(commands.map((c) => [c.name, c.effects]))).toEqual({ check: 'read_only', run: 'non_idempotent', propose: 'read_only', scorecard: 'read_only', compare: 'read_only', mine: 'idempotent', completion: 'read_only' });
    expect((await runBurgee(program, { argv: ['--version'] })).stdout).toContain(VERSION);
  });

  it('check reads the defaults under --repo, whose help names its default once', async () => {
    const r = await runBurgee(program, { argv: ['check', '--repo', folder(READY), '--json'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.json).toMatchObject({ data: { cases: 4 } });
    const help = (await runBurgee(program, { argv: ['check', '--help'] })).stdout;
    expect(help).toMatch(/--repo <dir> +the repository \(default: \.\)\n/);
  });

  it('prints a runtime failure with its fix and no usage block, which stays for a usage error', async () => {
    const failed = await runBurgee(program, { argv: ['check', '--repo', folder(REPO)] });
    expect(failed.code).toBe(ExitCode.RUNTIME);
    expect(failed.stderr).toContain('error: the tune set has no bug case; the test set has no control case\nfix: add the cases each set lacks');
    expect(failed.stderr).not.toContain('usage:');
    const json = await runBurgee(program, { argv: ['check', '--repo', folder(REPO), '--json'] });
    expect(json.json).toMatchObject({ ok: false, error: { kind: 'runtime', code: ExitCode.RUNTIME, fix: expect.stringMatching(/^add the cases/) } });
    expect(json.json).not.toHaveProperty('error.usage');
    const typo = await runBurgee(program, { argv: ['check', '--bogus'] });
    expect(typo.code).toBe(ExitCode.USAGE);
    expect(typo.stderr).toContain('usage: replz check [options]');
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

const line = (pr: number, body: string, inline = true): string => JSON.stringify({ pr, author: 'ofri', body, reply: false, inline });
const NOW = (): Date => new Date('2026-11-26T12:00:00Z');

describe('runMine', () => {
  it('reads both comment sources through gh since --days back, resolves the repository, and drafts', async () => {
    const asked: (readonly string[])[] = [];
    const answers = ['o/r\n', `${line(3, 'An empty catch here')}\n`, `${line(1, '[Nit] empty catch again', false)}\n`];
    const data = await runMine({
      repo: '/r',
      days: 10,
      minPrs: 2,
      limit: DEFAULT_CANDIDATES,
      gh: (args) => {
        asked.push(args);
        return Promise.resolve(answers.shift() as string);
      },
      now: NOW,
    });
    expect(asked[0]).toEqual(['api', 'repos/{owner}/{repo}', '--jq', '.full_name']);
    expect(asked[1]?.[2]).toBe('repos/o/r/pulls/comments?per_page=100&since=2026-11-16T00:00:00Z');
    expect(asked[2]?.[2]).toBe('repos/o/r/issues/comments?per_page=100&since=2026-11-16T00:00:00Z');
    expect(data).toMatchObject({ slug: 'o/r', since: '2026-11-16', findings: 2, written: null, changed: false, candidates: [{ phrase: 'empty catch', prs: [3, 1] }] });
    expect(text(data)).toMatch(/^# Rule candidates for o\/r\n/);
    expect(text(data)).not.toContain('written to');
  });

  it('takes --slug instead of asking gh, writes the draft under the repository, and says when it is already there', async () => {
    const dir = folder({});
    const asked: (readonly string[])[] = [];
    const options = {
      repo: dir,
      slug: 'a/b',
      days: 30,
      minPrs: 2,
      limit: 5,
      write: CANDIDATES,
      gh: (args: readonly string[]) => {
        asked.push(args);
        return Promise.resolve(`${line(4, 'stale cache key')}\n${line(5, 'a stale cache')}\n`);
      },
      now: NOW,
    };
    const data = await runMine(options);
    expect(asked.map((args) => args[2])).toEqual([
      'repos/a/b/pulls/comments?per_page=100&since=2026-10-27T00:00:00Z',
      'repos/a/b/issues/comments?per_page=100&since=2026-10-27T00:00:00Z',
    ]);
    expect(data).toMatchObject({ written: CANDIDATES, changed: true });
    expect(readFileSync(join(dir, CANDIDATES), 'utf8')).toContain('## 1. "stale cache": 2 pull requests');
    expect(text(data)).toMatch(/\nwritten to \.sdlc\/replz\/rule-candidates\.md$/);
    const again = await runMine(options);
    expect(again).toMatchObject({ written: CANDIDATES, changed: false });
    expect(text(again)).toMatch(/\nunchanged in \.sdlc\/replz\/rule-candidates\.md$/);
  });

  it('says what to widen when no pattern recurs', async () => {
    const data = await runMine({ repo: '/r', slug: 'o/r', days: 30, minPrs: 3, limit: 5, gh: () => Promise.resolve(`${line(1, 'empty catch')}\n`), now: NOW });
    expect(text(data)).toBe('no pattern in 2 review finding(s) since 2026-10-27 recurs in 3 or more pull requests. fix: widen --days, or lower --min-prs');
  });
});

const COMPARE_YAML = 'setup: build\ncommand: cli\ninputs: in\nnormalize: ["\\\\d+ms"]\n';
const repoWith = (yaml: string, inputs: Record<string, string> = { 'a.txt': 'A', 'b.txt': 'B' }): string =>
  folder({ '.sdlc/replz/compare.yaml': yaml, ...Object.fromEntries(Object.entries(inputs).map(([name, body]) => [`in/${name}`, body])) });
const trees = (): { worktrees: Worktrees; added: string[]; removed: string[] } => {
  const added: string[] = [];
  const removed: string[] = [];
  return {
    added,
    removed,
    worktrees: {
      add: (ref) => {
        added.push(ref);
        return Promise.resolve({
          dir: `/t/${ref}`,
          remove: () => {
            removed.push(ref);
            return Promise.resolve();
          },
        });
      },
    },
  };
};
/** The cli prints its input and how long it took; at the head, input B prints differently. */
const cli =
  (changed: boolean): Shell =>
  (command, options) => {
    if (command === 'build') return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    const head = !options.cwd.startsWith('/t/origin');
    const took = head ? '9' : '1';
    const stdout = changed && head && options.input === 'B' ? 'b!' : `${options.input ?? ''} in ${took}ms`;
    return Promise.resolve({ code: 0, stdout, stderr: '' });
  };

const brokenSetup: Shell = (command) => Promise.resolve({ code: command === 'build' ? 2 : 0, stdout: '', stderr: ' no package.json \n' });

describe('runCompare', () => {
  it('runs setup and every input through the base worktree and the working tree, and passes when only noise differs', async () => {
    const repo = repoWith(COMPARE_YAML);
    const ran: string[] = [];
    const { worktrees: wt, added, removed } = trees();
    const data = await runCompare({
      repo,
      config: '.sdlc/replz/compare.yaml',
      base: 'origin/main',
      shell: (command, options) => {
        ran.push(`${options.cwd === repo ? 'head' : options.cwd} ${command} ${options.input ?? ''}`.trim());
        return cli(false)(command, options);
      },
      worktrees: wt,
    });
    expect(ran).toEqual(['/t/origin/main build', '/t/origin/main cli A', '/t/origin/main cli B', 'head build', 'head cli A', 'head cli B']);
    expect([added, removed]).toEqual([['origin/main'], ['origin/main']]);
    expect(data).toMatchObject({ base: 'origin/main', head: 'the working tree', inputs: 2, same: 2, differs: [] });
    expect(text(data)).toBe('2 input(s) through origin/main and the working tree: 2 the same, 0 approved, 0 changed');
  });

  it('fails on a changed output with the entry that approves it, and passes once that entry is in the config', async () => {
    const repo = repoWith(COMPARE_YAML);
    const failure = runCompare({ repo, config: '.sdlc/replz/compare.yaml', base: 'origin/main', head: 'HEAD', shell: cli(true), worktrees: trees().worktrees });
    await expect(failure).rejects.toThrow(/b\.txt: line 3 changed\n {2}- B in <0>\n {2}\+ b!\n {2}approve: \{ input: "b\.txt", base: [0-9a-f]{12}, head: [0-9a-f]{12}, reason: <why> \}\n\nfix: repair the change/);
    const message = await failure.then(String, (error: unknown) => (error as Error).message);
    const entry = /approve: (\{.*\})/.exec(message)?.[1]?.replace('<why>', 'the new output is right') as string;
    writeFileSync(join(repo, '.sdlc/replz/compare.yaml'), `${COMPARE_YAML}approved:\n  - ${entry}\n`);
    const { worktrees: wt, added, removed } = trees();
    const data = await runCompare({ repo, config: '.sdlc/replz/compare.yaml', base: 'origin/main', head: 'HEAD', shell: cli(true), worktrees: wt });
    expect(data).toMatchObject({ head: 'HEAD', same: 1, approved: ['b.txt'] });
    expect([added, removed]).toEqual([
      ['origin/main', 'HEAD'],
      ['origin/main', 'HEAD'],
    ]);
  });

  it('refuses a missing config, an empty inputs folder and a setup that fails, removing the worktree it made', async () => {
    await expect(runCompare({ repo: folder({}), config: '.sdlc/replz/compare.yaml', base: 'b', shell: cli(false), worktrees: trees().worktrees })).rejects.toThrow(
      /compare\.yaml does not exist in .*\. fix: .*--config$/,
    );
    const empty = folder({ '.sdlc/replz/compare.yaml': COMPARE_YAML, 'in/sub/x': 'nested, not an input' });
    await expect(runCompare({ repo: empty, config: '.sdlc/replz/compare.yaml', base: 'b', shell: cli(false), worktrees: trees().worktrees })).rejects.toThrow(
      'in holds no input. fix: add one file per input the command reads on stdin',
    );
    const { worktrees: wt, removed } = trees();
    await expect(runCompare({ repo: repoWith(COMPARE_YAML), config: '.sdlc/replz/compare.yaml', base: 'v1', shell: brokenSetup, worktrees: wt })).rejects.toThrow(
      'setup failed at v1 (exit 2): no package.json. fix: make the setup command run in a fresh checkout of v1',
    );
    expect(removed).toEqual(['v1']);
  });
});
