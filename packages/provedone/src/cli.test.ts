import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { program } from './cli.js';

const scratch = scratchDirs();
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const repo = (): string => {
  const dir = realpathSync(scratch('provedone-cli-'));
  execFileSync('git', ['init', '-q', '-b', 'feat/x', dir], { env: withoutGit() });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Pat Doe'], { env: withoutGit() });
  return dir;
};

const ENV = { PROVEDONE_SESSION: 's1' };
const run = async (dir: string, argv: string[], env: Record<string, string> = ENV) => runBurgee(program, { argv: [...argv, '--root', dir], env });
const json = async (dir: string, argv: string[], env?: Record<string, string>) => {
  const r = await run(dir, [...argv, '--json'], env);
  return {
    code: r.code,
    data: (r.json as { data: Record<string, unknown> }).data,
    error: (r.json as { error?: { message: string; fix?: string } }).error,
  };
};
const stamps = (dir: string): unknown[] =>
  readFileSync(join(dir, '.git', 'provedone', 'stamps.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as unknown);

const INTENT = (status: string, extra = '') => `# Intent — t\n\n**Status:** ${status}\n\n## What is wanted\n\n## Why now\n\n## Constraints\n\n## Success criteria\n\n- one\n- two\n${extra}`;

const intents = (dir: string, files: Record<string, string>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, '.sdlc', 'intents', path, '..'), { recursive: true });
    writeFileSync(join(dir, '.sdlc', 'intents', path), text);
  }
};

const message = (dir: string, text: string): string => {
  writeFileSync(join(dir, 'MSG'), text);
  return join(dir, 'MSG');
};
const log = (dir: string): unknown[] =>
  readFileSync(join(dir, '.git', 'provedone', 'gate.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as unknown);
const templates = (dir: string): void => {
  intents(dir, {
    '_template/intent.md': '**Opened:** `<YYYY-MM-DD>` · **Owner:** `@<handle>`\n',
    '_template/spec.md': 'spec <YYYY-MM-DD>\n',
  });
};

beforeAll(async () => {
  await runBurgee(program, { argv: ['--version'] });
});

describe('stamp', () => {
  it('keeps a command and a gap whole when they carry commas', async () => {
    const r = await run(repo(), ['stamp', '--run', 'echo a,b true', '--not-checked', 'the docs, and true of the site']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Verified-by: echo a,b true -> exit 0 \(sha256:[\da-f]{12}\)\nNot-checked: the docs, and true of the site\n$/u);
  });

  it('runs each command and prints the trailers, recording the stamps on this branch', async () => {
    const dir = repo();
    const r = await run(dir, ['stamp', '--run', 'echo hi', '--capture', 'a.png', '--not-checked', 'docs', '--not-checked', 'nothing']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Verified-by: echo hi -> exit 0 \(sha256:[\da-f]{12}\)\nCaptured: a\.png\nNot-checked: docs\n$/u);
    expect(stamps(dir)).toEqual([
      {
        branch: 'feat/x',
        at: expect.any(String) as string,
        command: 'echo hi',
        exit: 0,
        digest: expect.stringMatching(/^sha256:/u) as string,
      },
    ]);
  });

  it('prints the PR block with --pr, and records the intent and criterion', async () => {
    const dir = repo();
    const r = await run(dir, ['stamp', '--run', 'exit 0', '--not-checked', 'nothing', '--intent', 'i', '--criterion', '2', '--pr']);
    expect(r.stdout).toContain('## How this was checked\n\nChecked: `exit 0` (pass). Not checked: nothing.\n\nVerified-by: exit 0 -> exit 0');
    expect(stamps(dir)).toEqual([expect.objectContaining({ intent: 'i', criterion: 2 })]);
  });

  it('returns the receipt, the trailers, the Checked: line and the PR block as data', async () => {
    const { code, data } = await json(repo(), ['stamp', '--none', 'docs only']);
    expect(code).toBe(0);
    expect(data).toEqual({
      exitCode: 0,
      changed: true,
      receipt: { checks: [], captures: [], notChecked: [], none: 'docs only' },
      trailers: ['Verified-by: none (docs only)'],
      checked: 'Checked: nothing (docs only). Not checked: nothing.',
      pr: '## How this was checked\n\nChecked: nothing (docs only). Not checked: nothing.\n\nVerified-by: none (docs only)',
    });
  });

  it('exits 1 when a command fails, still printing and recording it, with a fix', async () => {
    const dir = repo();
    const r = await run(dir, ['stamp', '--run', 'exit 3', '--run', 'exit 0', '--not-checked', 'x']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('Verified-by: exit 3 -> exit 3');
    expect(r.stdout).toContain('error: `exit 3` exited 3\nfix: make it pass and stamp again; a failing command is not a receipt');
    expect(stamps(dir)).toHaveLength(2);
  });

  it('kills a command at --command-timeout seconds', async () => {
    const dir = repo();
    writeFileSync(join(dir, 'wait.js'), 'setTimeout(() => 0, 1500);\n');
    const r = await run(dir, ['stamp', '--run', 'node wait.js', '--not-checked', 'x', '--command-timeout', '0.05']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('-> exit 1');
  });

  it.each([
    [['stamp', '--not-checked', 'x'], 'nothing to stamp', 'provedone stamp --run "<command>" --not-checked "<gap>", or provedone stamp --none "<reason>"'],
    [['stamp', '--run', 'exit 0', '--none', 'r'], '--none and --run together', 'drop --none: the commands are the receipt'],
    [['stamp', '--run', 'exit 0'], 'no --not-checked', 'add --not-checked "<what you did not check>", or --not-checked nothing'],
    [['stamp', '--none', 'r', '--intent', 'i'], '--intent and --criterion go together', 'pass both, or neither'],
    [['stamp', '--none', 'r', '--criterion', '1'], '--intent and --criterion go together', 'pass both, or neither'],
  ])('refuses %j as a usage error with a fix', async (argv, message, fix) => {
    const dir = repo();
    const r = await json(dir, argv);
    expect(r.code).toBe(2);
    expect(r.error).toMatchObject({ message, fix });
    expect(existsSync(join(dir, '.git', 'provedone'))).toBe(false);
  });
});

describe('gate', () => {
  it('passes a receipt and logs it', async () => {
    const dir = repo();
    const r = await run(dir, ['gate', message(dir, 'x\n\nVerified-by: none (docs)'), '--mode', 'enforce']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('provedone: unverified, with a reason\n');
    expect(log(dir)).toEqual([
      {
        at: expect.any(String) as string,
        session: 's1',
        mode: 'enforce',
        ok: true,
        blocked: false,
        bypass: false,
        reason: 'unverified, with a reason',
      },
    ]);
  });

  it('observes by default: passes a message with no receipt, says so, and logs that enforce would have blocked', async () => {
    const dir = repo();
    const r = await run(dir, ['gate', message(dir, 'x')], {});
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^provedone \(observe, not blocking\): no Verified-by: line\. fix: run `provedone stamp/u);
    expect(log(dir)).toEqual([
      expect.objectContaining({
        session: 'branch:feat/x',
        mode: 'observe',
        ok: false,
        blocked: false,
      }),
    ]);
  });

  it('reads the mode from PROVEDONE_MODE, ignores one it does not know, and lets --mode win', async () => {
    const dir = repo();
    const file = message(dir, 'x');
    expect((await run(dir, ['gate', file], { PROVEDONE_MODE: 'enforce' })).code).toBe(1);
    expect((await json(dir, ['gate', file], { PROVEDONE_MODE: 'loud' })).data['mode']).toBe('observe');
    expect(
      (
        await run(dir, ['gate', file, '--mode', 'observe'], {
          PROVEDONE_MODE: 'enforce',
        })
      ).code,
    ).toBe(0);
  });

  it('blocks twice in enforce, then passes the third as a logged bypass', async () => {
    const dir = repo();
    const file = message(dir, 'x');
    const first = await run(dir, ['gate', file, '--mode', 'enforce']);
    expect(first.code).toBe(1);
    expect(first.stdout).toMatch(/^provedone: no Verified-by: line\. fix: /u);
    expect((await run(dir, ['gate', file, '--mode', 'enforce'])).code).toBe(1);
    const third = await json(dir, ['gate', file, '--mode', 'enforce']);
    expect(third.code).toBe(0);
    expect(third.data).toMatchObject({
      exitCode: 0,
      mode: 'enforce',
      ok: false,
      blocked: false,
      bypass: true,
      reason: 'no Verified-by: line',
    });
    const text = await run(dir, ['gate', file, '--mode', 'enforce']);
    expect(text.code).toBe(1);
    expect(log(dir).map((e) => (e as { bypass: boolean }).bypass)).toEqual([false, false, true, false]);
  });

  it('says it passed a bypass in text', async () => {
    const dir = repo();
    const file = message(dir, 'x');
    await run(dir, ['gate', file, '--mode', 'enforce']);
    await run(dir, ['gate', file, '--mode', 'enforce']);
    expect((await run(dir, ['gate', file, '--mode', 'enforce'])).stdout).toMatch(/^provedone: no Verified-by: line; passed after two blocks in this session, logged\. fix: /u);
  });

  it('reads nothing and logs nothing when off', async () => {
    const dir = repo();
    const r = await run(dir, ['gate', join(dir, 'absent'), '--mode', 'off']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('provedone: off\n');
    expect(existsSync(join(dir, '.git', 'provedone'))).toBe(false);
  });

  it('refuses a file that is not there', async () => {
    const r = await json(repo(), ['gate', 'nope.txt']);
    expect(r.code).toBe(2);
    expect(r.error).toMatchObject({
      message: 'no file nope.txt',
      fix: 'pass the commit message file, as lefthook does with {1}',
    });
  });
});

describe('done', () => {
  it('fails with a fix per criterion with no evidence, then passes once each is stamped', async () => {
    const dir = repo();
    intents(dir, {
      'i/intent.md': INTENT('review', '\n| Criterion | Command | Output |\n| --- | --- | --- |\n| C2. two | `echo two` | `two` |\n'),
    });
    const open = await run(dir, ['done', 'i']);
    expect(open.code).toBe(1);
    expect(open.stdout).toBe(
      [
        'Checked: no criterion. Not checked: C1, C2.',
        'C1 has no evidence. fix: provedone stamp --intent i --criterion 1 --run "<the command that proves it>" --not-checked "<what you did not check>"',
        'C2 has no evidence. fix: provedone stamp --intent i --criterion 2 --run "echo two" --not-checked "<what you did not check>"',
        '',
      ].join('\n'),
    );
    await run(dir, ['stamp', '--intent', 'i', '--criterion', '1', '--run', 'exit 0', '--not-checked', 'nothing']);
    await run(dir, ['stamp', '--intent', 'i', '--criterion', '2', '--run', 'echo two', '--not-checked', 'nothing']);
    const met = await json(dir, ['done', 'i']);
    expect(met.code).toBe(0);
    expect(met.data).toMatchObject({
      exitCode: 0,
      intent: 'i',
      checked: 'Checked: C1 by `exit 0`; C2 by `echo two`. Not checked: nothing.',
    });
    expect((await run(dir, ['done', 'i'])).stdout).toBe('Checked: C1 by `exit 0`; C2 by `echo two`. Not checked: nothing.\n');
  });

  it('reads --dir', async () => {
    const dir = repo();
    mkdirSync(join(dir, 'docs', 'i'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'i', 'intent.md'), INTENT('review'));
    expect((await json(dir, ['done', 'i', '--dir', 'docs'])).data['criteria']).toHaveLength(2);
  });

  it('refuses an intent that is not there, or lists no criteria', async () => {
    const dir = repo();
    expect((await json(dir, ['done', 'nope'])).error).toMatchObject({
      message: 'no intent nope. fix: provedone intent new nope',
    });
    intents(dir, {
      'e/intent.md': '# Intent — e\n\n## Success criteria\n\nprose only\n',
    });
    const r = await json(dir, ['done', 'e']);
    expect(r.code).toBe(1);
    expect(r.error).toMatchObject({
      message: 'e lists no success criteria. fix: add `- ` items under its `## Success criteria`',
    });
  });
});

describe('intent new', () => {
  it('writes intent.md and spec.md from the templates, filled', async () => {
    const dir = repo();
    templates(dir);
    const r = await json(dir, ['intent', 'new', 'faster-help', '--owner', 'me', '--date', '2026-01-02']);
    expect(r.code).toBe(0);
    const target = join(dir, '.sdlc', 'intents', 'faster-help');
    expect(r.data).toEqual({
      changed: true,
      written: [join(target, 'intent.md'), join(target, 'spec.md')],
    });
    expect(readFileSync(join(target, 'intent.md'), 'utf8')).toBe('**Opened:** `2026-01-02` · **Owner:** `@me`\n');
    expect(readFileSync(join(target, 'spec.md'), 'utf8')).toBe('spec 2026-01-02\n');
  });

  it('takes the owner from git and the date from today, and prints the paths', async () => {
    const dir = repo();
    templates(dir);
    const r = await run(dir, ['intent', 'new', 'a']);
    expect(r.stdout).toBe(`${join(dir, '.sdlc/intents/a/intent.md')}\n${join(dir, '.sdlc/intents/a/spec.md')}\n`);
    expect(readFileSync(join(dir, '.sdlc/intents/a/intent.md'), 'utf8')).toBe(`**Opened:** \`${new Date().toISOString().slice(0, 10)}\` · **Owner:** \`@Pat Doe\`\n`);
  });

  it('falls back to "owner" when git names nobody', async () => {
    const dir = realpathSync(scratch('provedone-nogit-'));
    templates(dir);
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
    try {
      await run(dir, ['intent', 'new', 'a']);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(readFileSync(join(dir, '.sdlc/intents/a/intent.md'), 'utf8')).toContain('`@owner`');
  });

  it('refuses a slug that is not kebab case, suggesting one', async () => {
    const r = await json(repo(), ['intent', 'new', 'Faster  Help!']);
    expect(r.code).toBe(2);
    expect(r.error).toMatchObject({
      message: '"Faster  Help!" is not a slug',
      fix: 'provedone intent new faster-help',
    });
    expect((await json(repo(), ['intent', 'new', '_a_'])).error).toMatchObject({
      fix: 'provedone intent new a',
    });
  });

  it('refuses an intent that exists, and a missing template', async () => {
    const dir = repo();
    templates(dir);
    await run(dir, ['intent', 'new', 'a']);
    expect((await json(dir, ['intent', 'new', 'a'])).error).toMatchObject({
      message: `${join(dir, '.sdlc/intents/a')} already exists. fix: edit ${join(dir, '.sdlc/intents/a/intent.md')}, or pick another slug`,
    });
    const bare = repo();
    intents(bare, { '_template/intent.md': 'x' });
    const r = await json(bare, ['intent', 'new', 'b']);
    expect(r.code).toBe(1);
    expect(r.error).toMatchObject({
      message: `no template ${join(bare, '.sdlc/intents/_template/spec.md')}. fix: add _template/spec.md under ${join(bare, '.sdlc/intents')}`,
    });
    expect(existsSync(join(bare, '.sdlc/intents/b'))).toBe(false);
  });
  it('writes design.md where the templates name the design that way', async () => {
    const dir = repo();
    intents(dir, { '_template/intent.md': 'i\n', '_template/design.md': 'design <YYYY-MM-DD>\n' });
    const r = await json(dir, ['intent', 'new', 'a', '--owner', 'me', '--date', '2026-01-02']);
    expect(r.data['written']).toEqual([join(dir, '.sdlc/intents/a/intent.md'), join(dir, '.sdlc/intents/a/design.md')]);
    expect(readFileSync(join(dir, '.sdlc/intents/a/design.md'), 'utf8')).toBe('design 2026-01-02\n');
  });
});

describe('intent check', () => {
  it('passes a well-formed tree, counting the shipped intents with no evidence', async () => {
    const dir = repo();
    intents(dir, {
      'README.md': '| [`a/`](a/intent.md) | review |\n',
      'a/intent.md': INTENT('review'),
      'b/intent.md': INTENT('shipped'),
      'b/spec.md': '## Out of scope\n',
      '_template/intent.md': 'not an intent',
    });
    const r = await run(dir, ['intent', 'check']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('2 intents, 0 problems, 1 shipped with no evidence\n');
    expect((await json(dir, ['intent', 'check'])).data).toMatchObject({
      exitCode: 0,
      intents: 2,
      findings: [],
      noEvidence: ['b'],
      reruns: [],
      notRerun: [],
    });
  });

  it('fails on each broken rule and index drift, one line and fix each', async () => {
    const dir = repo();
    intents(dir, {
      'README.md': '| [`a/`](a/intent.md) | draft |\n',
      'a/intent.md': INTENT('shipped', '## Shipped\n'),
      'empty/spec.md': '## Rejected\n',
    });
    const r = await run(dir, ['intent', 'check']);
    expect(r.code).toBe(1);
    expect(r.stdout.split('\n')).toEqual([
      'a: is "shipped" but has no spec.md. fix: write .sdlc/intents/a/spec.md, or set the status back to review',
      'empty: no `# Intent — <title>` line. fix: make the first line `# Intent — <short title>`',
      'empty: unknown or missing status "undefined". fix: write `**Status:** <draft|review|approved|shipped|dropped>` under the title',
      'empty: lacks ## What is wanted. fix: add a `## What is wanted` section',
      'empty: lacks ## Why now. fix: add a `## Why now` section',
      'empty: lacks ## Constraints. fix: add a `## Constraints` section',
      'empty: no `## Success criteria`. fix: add `## Success criteria`: each line checkable by a person or a command',
      'a: the index says "draft", the intent says "shipped". fix: set the index row\'s status to "shipped"',
      '2 intents, 8 problems, 0 shipped with no evidence',
      '',
    ]);
  });

  it('re-runs the evidence of shipped intents with --evidence, failing on a changed exit code or a lost output', async () => {
    const dir = repo();
    writeFileSync(join(dir, 'note.md'), 'a document');
    const table = [
      '| Criterion | Command | Output |',
      '| --- | --- | --- |',
      '| C1. ok | `echo hello` | `hello` |',
      '| C2. refused | `exit 2` | exit 2 |',
      '| C3. drifted | `exit 1` | passes |',
      '| C4. lost | `echo bye` | `hello`, `bye` |',
      '| C5. prose | ran `npm test` | ok |',
      '| C6. a document | `note.md` | closed |',
    ].join('\n');
    intents(dir, {
      's/intent.md': INTENT('shipped', table),
      's/spec.md': '## Out of scope\n',
      'r/intent.md': INTENT('review', '| Criterion | Command | Output |\n| - | - | - |\n| C1 | `exit 9` | x |'),
    });
    const r = await json(dir, ['intent', 'check', '--evidence', '--command-timeout', '30']);
    expect(r.error).toBeUndefined();
    expect(r.code).toBe(1);
    expect(r.data['reruns']).toEqual([
      {
        intent: 's',
        criterion: 'C1. ok',
        command: 'echo hello',
        exit: 0,
        expected: 0,
        missing: [],
      },
      {
        intent: 's',
        criterion: 'C2. refused',
        command: 'exit 2',
        exit: 2,
        expected: 2,
        missing: [],
      },
      {
        intent: 's',
        criterion: 'C3. drifted',
        command: 'exit 1',
        exit: 1,
        expected: 0,
        missing: [],
      },
      {
        intent: 's',
        criterion: 'C4. lost',
        command: 'echo bye',
        exit: 0,
        expected: 0,
        missing: ['hello'],
      },
    ]);
    expect(r.data['notRerun']).toEqual([
      { intent: 's', criterion: 'C5. prose' },
      { intent: 's', criterion: 'C6. a document' },
    ]);
    const text = await run(dir, ['intent', 'check', '--evidence']);
    expect(text.stdout.split('\n')).toEqual([
      's: `exit 1` exits 1, recorded 0. fix: re-run it and update the evidence row, or restore what it proved',
      's: `echo bye` no longer prints `hello`. fix: re-run it and update the evidence row, or restore what it proved',
      '2 intents, 2 problems, 0 shipped with no evidence, 4 re-run, 2 not re-run',
      '',
    ]);
  });

  it('passes when every evidence command still does what it recorded', async () => {
    const dir = repo();
    intents(dir, {
      's/intent.md': INTENT('shipped', '| Criterion | Command | Output |\n| - | - | - |\n| C1 | `echo hi` | `hi` |'),
      's/spec.md': '## Out of scope\n',
    });
    const r = await run(dir, ['intent', 'check', '--evidence']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('1 intents, 0 problems, 0 shipped with no evidence, 1 re-run, 0 not re-run\n');
  });

  it('reads design.md as the spec, naming the file and the --dir it was given in each fix', async () => {
    const dir = repo();
    const put = (path: string, text: string): void => {
      mkdirSync(join(dir, 'docs', 'intents', path, '..'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'intents', path), text);
    };
    put('_template/design.md', '# Design\n');
    put('ok/intent.md', INTENT('shipped', '## Shipped\n'));
    put('ok/design.md', '## Rejected alternatives\n');
    put('bare/intent.md', INTENT('approved'));
    put('loose/intent.md', INTENT('review'));
    put('loose/design.md', '# Design\n');
    const r = await run(dir, ['intent', 'check', '--dir', 'docs/intents']);
    expect(r.code).toBe(1);
    expect(r.stdout.split('\n')).toEqual([
      'bare: is "approved" but has no design.md. fix: write docs/intents/bare/design.md, or set the status back to review',
      'loose: design.md records nothing rejected. fix: add `## Rejected alternatives` or `## Out of scope` to design.md',
      '3 intents, 2 problems, 0 shipped with no evidence',
      '',
    ]);
  });

  it('reads --dir, and refuses a directory that is not there', async () => {
    const dir = repo();
    mkdirSync(join(dir, 'docs', 'a'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'a', 'intent.md'), INTENT('review'));
    writeFileSync(join(dir, 'docs', 'loose.md'), 'not a directory');
    expect((await json(dir, ['intent', 'check', '--dir', 'docs'])).data['intents']).toBe(1);
    const r = await json(repo(), ['intent', 'check']);
    expect(r.code).toBe(1);
    expect(r.error?.message).toMatch(/^no intents directory at .*\.sdlc[\\/]intents\. fix: run `provedone intent new <slug>` after adding _template\/, or pass --dir$/u);
  });
});

describe('the program', () => {
  it('declares its commands and what each does to files', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    const { commands } = JSON.parse(r.stdout) as {
      commands: { name: string; effects?: string }[];
    };
    expect(Object.fromEntries(commands.map((c) => [c.name, c.effects]))).toMatchObject({
      stamp: 'non_idempotent',
      gate: 'non_idempotent',
      done: 'read_only',
      'intent new': 'non_idempotent',
      'intent check': 'read_only',
    });
  });
});
