/**
 * Shell completion held to the installed yargs, byte for byte.
 *
 * yargs 18.2.0 added fish (`SHELL` naming fish: candidates as `value<TAB>description`,
 * choices verbatim, and a script for `~/.config/fish/completions`) and dropped a stray quote
 * from the zsh script's `zsh_eval_context` test, which made `compdef` run even when zsh was
 * autoloading the function. The vendored suite grades the candidates; it matches the scripts
 * only by a regex, so this file compares the scripts themselves, and the fish candidates on
 * the inputs the suite does not use — a choice holding the characters zsh has to escape.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import realYargs from 'yargs';

import yargs from '../yargs.js';

import { completionFishTemplate, completionShTemplate, completionZshTemplate } from './completion.js';

const templatesUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.resolve('yargs'))), 'build/lib/completion-templates.js')).href;
// eslint-disable-next-line node-security/no-dynamic-dependency-loading -- yargs' exports map does not reach its templates, so the installed file is imported by path; the path is yargs' own resolved entry, never an input
const upstream = (await import(templatesUrl)) as Record<'completionShTemplate' | 'completionZshTemplate' | 'completionFishTemplate', string>;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the completion script templates', () => {
  it('are the installed yargs templates, byte for byte', () => {
    expect(completionShTemplate).toBe(upstream.completionShTemplate);
    expect(completionZshTemplate).toBe(upstream.completionZshTemplate);
    expect(completionFishTemplate).toBe(upstream.completionFishTemplate);
  });
});

/** What `showCompletionScript()` prints under `shell`, from either implementation. */
function script(make: (argv: string[]) => any, shell: string): string {
  vi.stubEnv('SHELL', shell);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  make([]).showCompletionScript('./app.js', 'completion');
  const printed = log.mock.calls.map((c) => c.join(' ')).join('\n');
  log.mockRestore();
  return printed;
}

describe('showCompletionScript picks the script by SHELL', () => {
  it.each(['/usr/bin/fish', '/bin/zsh', '/bin/bash'])('prints what yargs prints under %s', (shell) => {
    const ours = script(yargs, shell);
    expect(ours).toBe(script(realYargs, shell));
    expect(ours).toContain('###-begin-app.js-completions-###');
  });

  it('writes the fish script where fish reads completions from', () => {
    expect(script(yargs, '/usr/bin/fish')).toContain('> ~/.config/fish/completions/app.js.fish');
  });
});

/** The candidates both implementations offer for `args`, under `shell`. */
async function candidates(make: (argv: string[]) => any, shell: string, args: string[]): Promise<string[]> {
  vi.stubEnv('SHELL', shell);
  const y = make([])
    .command('a\\b:c', 'a command with both in its name')
    .option('mode', { choices: ['x\\y', 'p:q', 'r\\'], describe: 'pick one' })
    .option('w\\z', { type: 'string', describe: 'odd key' });
  return (await y.getCompletion(args)) as string[];
}

describe('fish candidates are `value<TAB>description`, nothing escaped', () => {
  it.each([[['']], [['--']], [['--mode', '']], [['--mode', 'p']]])('answer %j as yargs does', async (args) => {
    expect(await candidates(yargs, '/usr/bin/fish', args)).toEqual(await candidates(realYargs, '/usr/bin/fish', args));
  });

  it('describes commands and options after a tab', async () => {
    expect(await candidates(yargs, '/usr/bin/fish', [''])).toContain('a\\b:c\ta command with both in its name');
    expect(await candidates(yargs, '/usr/bin/fish', ['--'])).toContain('--w\\z\todd key');
  });

  it('offers choices verbatim, where zsh would escape them', async () => {
    expect(await candidates(yargs, '/usr/bin/fish', ['--mode', ''])).toEqual(['x\\y', 'p:q', 'r\\']);
  });
});

describe('bash candidates stay bare', () => {
  it.each([[['']], [['--']]])('answer %j as yargs does', async (args) => {
    expect(await candidates(yargs, '/bin/bash', args)).toEqual(await candidates(realYargs, '/bin/bash', args));
  });
});
