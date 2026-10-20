/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * completion-context R1–R4 — a completer sees the rest of the line (yargs #793). It is called
 * `complete(partial, context)`, where `context` holds the command path, the options typed before
 * the cursor (coerced the way a run coerces them, and any that fail kept raw), and the
 * positionals. A positional declares a completer the same way an option does. Every shell
 * passes the words before the cursor, so the completer gets the same context in all four.
 *
 * The real-shell cases run a program on `PATH` whose `--branch` completer offers branches of
 * the `--remote` typed before it, and whose `cp` completes its second positional from its
 * first, so the context is checked as the shell delivers it rather than as a test hands it over.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { completeDynamic } from './complete-dynamic.js';
import { renderCompletion, SHELLS } from './completions.js';
import { type CompletionContext, defineCommand, defineProgram } from './index.js';
import { Manifest } from './manifest.js';
import { runBurgee } from './testing.js';

const scratch = scratchDirs();

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const dist = resolve(here, '../dist/index.js');

/** Every call a completer received, newest last. */
const calls: { at: string; partial: string; context: CompletionContext }[] = [];
const record =
  (at: string, offer: (partial: string, context: CompletionContext) => string[]) =>
  (partial: string, context: CompletionContext): string[] => {
    calls.push({ at, partial, context });
    return offer(partial, context);
  };
const lastCall = (): (typeof calls)[number] | undefined => calls.at(-1);

const program = defineProgram({
  name: 'ctxp',
  commands: [
    defineCommand({
      name: 'deploy',
      options: {
        remote: { type: 'string', required: true },
        branch: { type: 'string', complete: record('branch', (_p, c) => [`${String(c.options['remote'])}/main`, `${String(c.options['remote'])}/dev`]) },
        port: { type: 'number', integer: true },
        force: { type: 'boolean' },
        tag: { type: 'string', multiple: true },
        tier: { type: 'string', choices: ['free', 'pro'] },
        stage: { type: 'string', choices: ['dev', 'prod'] },
        level: { type: 'number', multiple: true, separator: ':' },
        ports: { type: 'number', multiple: true },
        region: { type: 'string', short: 'r', complete: (p: string) => ['eu-west', 'us-east'].filter((r) => r.startsWith(p)) },
      },
      effects: 'withheld',
      run: () => 'deployed',
    }),
    defineCommand({
      name: 'cp',
      arguments: [
        { name: 'from', description: 'the source' },
        { name: 'to', complete: record('to', (_p, c) => [`${c.positionals[0] ?? ''}.bak`, `${c.positionals[0] ?? ''}.old`]) },
        { name: 'rest', variadic: true, complete: record('rest', (_p, c) => [`more-${c.positionals.length}`, `-more-${c.positionals.length}`]) },
      ],
      options: { mode: { type: 'string' }, force: { type: 'boolean' } },
      effects: 'withheld',
      run: () => 'copied',
    }),
    defineCommand({
      name: 'ln',
      arguments: [{ name: 'target', complete: () => ['t1'] }],
      effects: 'withheld',
      run: () => 'linked',
    }),
    defineCommand({
      name: 'open',
      arguments: [{ name: 'path', type: 'file', complete: () => ['./a'] }, { name: 'how', complete: () => ['view'] }],
      effects: 'withheld',
      run: () => 'opened',
    }),
    defineCommand({
      name: 'remote',
      description: 'remotes',
      commands: [defineCommand({ name: 'add', options: { url: { type: 'string', complete: () => ['https://'] } }, effects: 'withheld', run: () => 'added' })],
    }),
    defineCommand({
      name: 'mv',
      arguments: [
        {
          name: 'from',
          complete: () => {
            throw new Error('the disk is gone');
          },
        },
      ],
      effects: 'withheld',
      run: () => 'moved',
    }),
  ],
});

const complete = async (...words: string[]): Promise<string> => {
  const r = await runBurgee(program, { argv: ['__complete', ...words] });
  expect([r.code, r.stderr]).toStrictEqual([0, '']);
  return r.stdout;
};

describe('R1, R2 — a completer is handed the line before the cursor', () => {
  it('`--branch` is completed from the `--remote` typed before it (criterion 1)', async () => {
    expect(await complete('deploy', '--remote', 'origin', '--branch', '')).toBe('origin/main\norigin/dev\n');
    expect(lastCall()).toStrictEqual({ at: 'branch', partial: '', context: { path: ['deploy'], options: { remote: 'origin' }, positionals: [], raw: {} } });
  });

  it('the partial is still the completer’s first argument, and still filters what it offers', async () => {
    expect(await complete('deploy', '--remote', 'up', '--branch', 'up/m')).toBe('up/main\n');
    expect(lastCall()?.partial).toBe('up/m');
  });

  it('values are coerced as a run coerces them: a number is a number, the last spelling of a boolean wins, a repeatable collects', async () => {
    await complete('deploy', '--port', '8080', '--force', '--no-force', '--tag', 'a', '--tag', 'b', '--remote', 'o', '--branch', '');
    expect(lastCall()?.context.options).toStrictEqual({ port: 8080, force: false, tag: ['a', 'b'], remote: 'o' });
    await complete('deploy', '--no-force', '--force', '--branch', '');
    expect(lastCall()?.context.options).toStrictEqual({ force: true });
  });

  it('a repeatable that fails keeps every value it was given in `raw`, joined by its own separator', async () => {
    await complete('deploy', '--level', '1', '--level', 'x', '--branch', '');
    expect(lastCall()?.context).toStrictEqual({ path: ['deploy'], options: {}, positionals: [], raw: { level: '1:x' } });
    await complete('deploy', '--level', '1', '--level', '2', '--branch', '');
    expect(lastCall()?.context.options).toStrictEqual({ level: [1, 2] });
    await complete('deploy', '--ports', '1', '--ports', 'x', '--branch', '');
    expect(lastCall()?.context.raw).toStrictEqual({ ports: '1,x' });
  });

  it('`--no-<name>` negates only a boolean, and an option the command does not declare is not in the context', async () => {
    await complete('deploy', '--no-remote', '--undeclared', 'v', '--branch', '');
    expect(lastCall()?.context).toStrictEqual({ path: ['deploy'], options: {}, positionals: ['v'], raw: {} });
  });

  it('a value that fails coercion is in `raw`, as typed, and not in `options` — not even an earlier good one', async () => {
    await complete('deploy', '--port', '80', '--port', 'eighty', '--tier', 'gold', '--remote', 'o', '--branch', '');
    expect(lastCall()?.context).toStrictEqual({ path: ['deploy'], options: { remote: 'o' }, positionals: [], raw: { port: 'eighty', tier: 'gold' } });
    await complete('deploy', '--port', '1.5', '--branch', '');
    expect(lastCall()?.context.raw).toStrictEqual({ port: '1.5' });
  });

  it('the unfinished line never errors: a missing required option is absent, and the option being completed is not in the context', async () => {
    expect(await complete('deploy', '--branch', '')).toBe('undefined/main\nundefined/dev\n');
    expect(lastCall()?.context.options).toStrictEqual({});
  });

  it('a short spelling reaches its option’s completer, as the long one does', async () => {
    expect(await complete('deploy', '-r', 'eu')).toBe('eu-west\n');
    await complete('deploy', '-r', 'us-east', '--branch', '');
    expect(lastCall()?.context.options).toStrictEqual({ region: 'us-east' });
  });

  it('a shell that drops the empty word under the cursor still completes the option it ended on', async () => {
    // PowerShell before 7.3 drops an empty argument to a native command, as `$wordToComplete` is after a space.
    expect(await complete('deploy', '--remote', 'origin', '--branch')).toBe('origin/main\norigin/dev\n');
    expect(lastCall()?.partial).toBe('');
  });

  it('one-argument completers keep working, called with the same partial (criterion 3)', async () => {
    expect(await complete('deploy', '--region', 'us')).toBe('us-east\n');
  });
});

describe('R3 — a positional completes through its own completer', () => {
  it('a program that is one command completes its own positional, and an empty call is an empty partial', async () => {
    const solo = new Manifest();
    solo.rootPath = ['solo'];
    solo.add({ path: ['solo'], options: {}, arguments: [{ name: 'what', complete: () => ['one', 'two'] }], effects: 'read_only', run: () => 'ran' });
    const out: string[] = [];
    await completeDynamic(solo, [], (t) => out.push(t));
    await completeDynamic(solo, ['t'], (t) => out.push(t));
    expect(out).toStrictEqual(['one\ntwo\n', 'two\n']);
  });

  it('the positional under the cursor is the one called, counted against what was typed (criterion 2)', async () => {
    expect(await complete('cp', 'notes.txt', '')).toBe('notes.txt.bak\nnotes.txt.old\n');
    expect(lastCall()).toStrictEqual({ at: 'to', partial: '', context: { path: ['cp'], options: {}, positionals: ['notes.txt'], raw: {} } });
  });

  it('an option’s value is not counted as a positional', async () => {
    expect(await complete('cp', '--mode', 'fast', 'a', 'a.')).toBe('a.bak\na.old\n');
    expect(lastCall()?.context).toStrictEqual({ path: ['cp'], options: { mode: 'fast' }, positionals: ['a'], raw: {} });
  });

  it('a variadic positional completes every slot from its own onwards', async () => {
    expect(await complete('cp', 'a', 'b', '')).toBe('more-2\n-more-2\n');
    expect(await complete('cp', 'a', 'b', 'c', 'm')).toBe('more-3\n');
    expect(await complete('cp', 'a', 'b', 'c', 'd', 'm')).toBe('more-4\n');
  });

  it('a positional past the last declared one completes nothing, unless the last is variadic', async () => {
    expect(await complete('ln', '')).toBe('t1\n');
    expect(await complete('ln', 'x', '')).toBe('');
    expect(await complete('deploy', '')).toBe('');
  });

  it('a boolean, or an option whose value is already typed, does not hold the cursor: the next positional does', async () => {
    expect(await complete('cp', 'a', '--force', '')).toBe('a.bak\na.old\n');
    expect(await complete('cp', 'a', '--mode', 'fast', '')).toBe('a.bak\na.old\n');
  });

  it('a partial that starts with `-` is an option being typed, and offers no positional — unless it follows `--`', async () => {
    expect(await complete('cp', 'a', 'b', '-m')).toBe('');
    expect(await complete('cp', '--', 'a', 'b', '-m')).toBe('-more-2\n');
  });

  it('after `--`, a word that looks like an option is a positional', async () => {
    expect(await complete('cp', '--', '--weird', '')).toBe('--weird.bak\n--weird.old\n');
  });

  it('offers nothing for a positional with no completer, for a partial option, or for a completer that throws', async () => {
    const lines = [['cp', ''], ['cp', 'a', '--mo'], ['mv', '']];
    const out = await Promise.all(lines.map(async (words) => await complete(...words)));
    expect(out).toStrictEqual(['', '', '']);
  });
});

// ───── the shells ──────────────────────────────────────────────────────────────────────

// No two candidates share a prefix: zsh inserts a common prefix instead of listing (LIST_AMBIGUOUS).
const PROGRAM = `
import { defineCommand, defineProgram, execute } from ${JSON.stringify(dist)};
await execute(defineProgram({
  name: 'ctxp',
  commands: [
    defineCommand({
      name: 'deploy',
      options: {
        remote: { type: 'string' },
        branch: { type: 'string', complete: (p, c) => ['main@' + c.options.remote, 'dev@' + c.options.remote].filter((b) => b.startsWith(p)) },
      },
      effects: 'withheld',
      run: () => 'deployed',
    }),
    defineCommand({
      name: 'cp',
      arguments: [{ name: 'from' }, { name: 'to', complete: (p, c) => ['bak-' + c.positionals[0], 'old-' + c.positionals[0]].filter((w) => w.startsWith(p)) }],
      effects: 'withheld',
      run: () => 'copied',
    }),
  ],
}));
`;

const dir = scratch('burgee-context-');
writeFileSync(join(dir, 'prog.mjs'), PROGRAM);
writeFileSync(join(dir, 'ctxp'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, 'prog.mjs'))} "$@"\n`);
chmodSync(join(dir, 'ctxp'), 0o755);
const env = { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` };
const EXT = { bash: 'bash', zsh: 'zsh', fish: 'fish', pwsh: 'ps1' } as const;
const scriptFor = (shell: (typeof SHELLS)[number]): string => {
  const at = join(dir, `ctxp.${EXT[shell]}`);
  writeFileSync(at, renderCompletion(program, shell));
  return at;
};
/** As in `completions-dynamic.test.ts`: where the job installs the shells, a missing one fails. */
const REQUIRE_SHELLS = process.env['REQUIRE_SHELLS'] === '1';
const has = (shell: string): boolean => {
  try {
    execFileSync(shell, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    if (REQUIRE_SHELLS) throw new Error(`${shell} is not installed, and REQUIRE_SHELLS=1 says this job installs it`);
    return false;
  }
};
const POSIX = process.platform !== 'win32';
const lines = (out: string): string[] => out.split('\n').map((l) => l.trim()).filter((l) => l !== '');

const bash = (line: string): string[] => lines(execFileSync('bash', [join(repo, 'scripts/complete-bash.sh'), scriptFor('bash'), ...line.split(' ')], { encoding: 'utf8', env }));
const zsh = (line: string): string => execFileSync('zsh', [join(repo, 'scripts/complete-zsh.zsh'), scriptFor('zsh'), line], { encoding: 'utf8', env });
const fish = (line: string): string[] => lines(execFileSync('fish', [join(repo, 'scripts/complete-fish.fish'), scriptFor('fish'), line], { encoding: 'utf8', env })).map((l) => l.split('\t')[0] ?? '');
const pwsh = (line: string): string[] =>
  lines(
    execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts/complete-pwsh.ps1'), '-Script', scriptFor('pwsh'), '-Line', line], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 100_000,
      env: { ...env, POWERSHELL_UPDATECHECK: 'Off', POWERSHELL_TELEMETRY_OPTOUT: '1' },
    }),
  );

/**
 * The words each script hands over, as text. The real-shell cases below are the proof; these
 * hold the same lines where a shell is not installed (the mutation lane has no zsh or fish).
 */
/** zsh's `_arguments` action that lists what `<name> __complete <words> "$PREFIX"` returned. */
const zshAsk = (words: string, name = 'ctxp'): string => `{compadd -- \${(f)"$(${name} __complete ${words} "$PREFIX" 2>/dev/null)"}}`;

describe('R4 — what each script passes, as written', () => {
  const solo = new Manifest();
  solo.rootPath = ['solo'];
  solo.add({ path: ['solo'], options: { level: { type: 'string', complete: () => ['hi'] } }, effects: 'read_only', run: () => 'ran' });

  it('bash: the words before the cursor, then the partial, for an option and for a positional', () => {
    const script = renderCompletion(program, 'bash');
    expect(script).toContain(`--branch) COMPREPLY=($(compgen -W "$(ctxp __complete "\${words[@]:1:cword-1}" "$cur" 2>/dev/null)" -- "$cur")); return ;;`);
    expect(script).toContain(`COMPREPLY=($(compgen -W ''" $(ctxp __complete "\${words[@]:1:cword-1}" "$cur" 2>/dev/null)" -- "$cur"))`);
    expect(script.match(/COMPREPLY=\(\$\(compgen -W ''" \$\(ctxp __complete/gu)).toHaveLength(4);
    expect(script).toContain(`      --tier) COMPREPLY=($(compgen -W 'free pro' -- "$cur")); return ;;`);
    expect(script).toContain(`      -r|--region) COMPREPLY=($(compgen -W "$(ctxp __complete`);
  });

  it('zsh: the path above the command, then its shifted words; the root passes its own from the second', () => {
    const script = renderCompletion(program, 'zsh');
    expect(script).toContain(`'--branch[]:branch:${zshAsk('"${(@Q)words[1,CURRENT-1]}"')}'`);
    expect(script).toContain(`'--url[]:url:${zshAsk('remote "${(@Q)words[1,CURRENT-1]}"')}'`);
    expect(script).toContain(`'1: :_files' '2: :${zshAsk('"${(@Q)words[1,CURRENT-1]}"')}' '*: :${zshAsk('"${(@Q)words[1,CURRENT-1]}"')}'`);
    expect(script).toContain(`'1: :_files' '2: :${zshAsk('"${(@Q)words[1,CURRENT-1]}"')}'\n}`);
    expect(script.match(/'\*: :_files'/gu)).toHaveLength(2);
    expect(renderCompletion(solo, 'zsh')).toContain(`'--level[]:level:${zshAsk('"${(@Q)words[2,CURRENT-1]}"', 'solo')}'`);
  });

  it('fish: the tokens before the cursor less the program, then the current one, for an option and for a positional', () => {
    const script = renderCompletion(program, 'fish');
    const ask = "'(ctxp __complete (set -l w (commandline -opc); set -e w[1]; string join \\n -- $w) (commandline -ct) 2>/dev/null)'";
    expect(script).toContain(`complete -c ctxp -n '__fish_seen_subcommand_from deploy' -l branch -r -f -a ${ask} -d ''`);
    for (const command of ['cp', 'ln', 'open', 'mv']) expect(script).toContain(`complete -c ctxp -n '__fish_seen_subcommand_from ${command}' -f -a ${ask}\n`);
    expect(script.match(/-f -a '\(ctxp __complete/gu)).toHaveLength(7);
  });

  it('PowerShell: `$words` less the word under the cursor, for an option and for a positional', () => {
    const script = renderCompletion(program, 'pwsh');
    expect(script).toContain("if ($wordToComplete -ne '' -and $words.Count -gt 0) { $words = @($words | Select-Object -First ($words.Count - 1)) }");
    expect(script).toContain("& 'ctxp' __complete @words $wordToComplete 2>$null | ForEach-Object");
    expect(script).toContain(`  if ($entry.Positional -and $wordToComplete -notlike '-*') {
    $found = @(& 'ctxp' __complete @words $wordToComplete 2>$null)
    if ($found.Count -gt 0) { $found | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }; return }
  }
`);
    expect(script).toContain(
      "    'cp' = @{ Items = @(@('--mode', 'ParameterName', ''), @('--force', 'ParameterName', ''), @('--no-force', 'ParameterName', ''), @('--json', 'ParameterName', 'machine-readable output'), @('--help', 'ParameterName', 'show this help')); Values = @{  }; Positional = $true }\n",
    );
    expect(script).toContain("Values = @{ '--tier' = @('free', 'pro'); '--stage' = @('dev', 'prod') }; Dynamic = @{ '--branch' = $true; '--region' = $true } }\n");
    expect(script.match(/; Positional = \$true \}/gu)).toHaveLength(4);
    expect(renderCompletion(solo, 'pwsh')).not.toContain('$entry.Positional');
  });
});

describe('R4 — every shell passes the words before the cursor (criterion 4)', () => {
  it.each(SHELLS)('%s: the script says it runs the program for the arguments that declare a completer too', (shell) => {
    expect(renderCompletion(program, shell)).toContain('runs ctxp on TAB only for the options and arguments that declare a completer');
  });

  it.runIf(POSIX && has('bash'))('bash: `--branch` sees `--remote`, and `cp`’s second word sees its first', { timeout: 30_000 }, () => {
    expect(bash('ctxp deploy --remote origin --branch ')).toEqual(['main@origin', 'dev@origin']);
    expect(bash('ctxp cp notes ')).toEqual(['bak-notes', 'old-notes']);
  });

  it.runIf(POSIX && has('zsh'))('zsh: `--branch` sees `--remote`', { timeout: 120_000 }, () => {
    const out = zsh('ctxp deploy --remote origin --branch ');
    for (const b of ['main@origin', 'dev@origin']) expect(out).toContain(b);
  });

  it.runIf(POSIX && has('zsh'))('zsh: `cp`’s second word sees its first', { timeout: 120_000 }, () => {
    const out = zsh('ctxp cp notes ');
    for (const w of ['bak-notes', 'old-notes']) expect(out).toContain(w);
  });

  it.runIf(POSIX && has('fish'))('fish: `--branch` sees `--remote`, and `cp`’s second word sees its first', { timeout: 30_000 }, () => {
    expect(fish('ctxp deploy --remote origin --branch ')).toEqual(expect.arrayContaining(['main@origin', 'dev@origin']));
    expect(fish('ctxp cp notes ')).toEqual(expect.arrayContaining(['bak-notes', 'old-notes']));
  });

  it.runIf(POSIX && has('pwsh'))('PowerShell: `--branch` sees `--remote`, and `cp`’s second word sees its first', { timeout: 120_000 }, () => {
    expect(pwsh('ctxp deploy --remote origin --branch ')).toEqual(['main@origin', 'dev@origin']);
    expect(pwsh('ctxp cp notes ')).toEqual(['bak-notes', 'old-notes']);
  });
});
