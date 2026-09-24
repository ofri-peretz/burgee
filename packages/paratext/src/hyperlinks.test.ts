/**
 * `paratext/terminal-link` links exactly where `supports-hyperlinks` 4.5.0 says to (A27).
 *
 * Each case is asked of the real incumbent in a child process of its own — `supports-color`
 * keeps `--color` state in a module global that an earlier case's `FORCE_COLOR` overwrites,
 * so one process asked sixty questions would answer some of them from history — and of the
 * façade through `terminalLinkFor`, which is the path a caller takes. The façade that read
 * `LINK.when` failed 30 of these 56. The incumbent says yes to 29 of the 55 environments,
 * so agreement cannot come from both sides answering the same thing everywhere.
 */
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { terminalLinkFor } from './terminal-link.js';

interface Case {
  env: Record<string, string>;
  argv?: string[];
  platform?: string;
  tty?: boolean;
}

const xterm = { TERM: 'xterm-256color' };
const iterm = { ...xterm, TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.1.0' };

const CASES: Record<string, Case> = {
  'a plain xterm': { env: xterm },
  'iTerm2 3.1.0': { env: iterm },
  'iTerm2 3.0.9': { env: { ...xterm, TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.0.9' } },
  'iTerm2 2.9': { env: { ...xterm, TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '2.9' } },
  'iTerm2 4.0': { env: { ...xterm, TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '4.0' } },
  'iTerm2, no version': { env: { ...xterm, TERM_PROGRAM: 'iTerm.app' } },
  'WezTerm 20200620': { env: { ...xterm, TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '20200620-160318-e00b076c' } },
  'WezTerm 20200619': { env: { ...xterm, TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '20200619' } },
  'WezTerm from Nix, 2020-06-20': { env: { ...xterm, TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '0-unstable-2020-06-20' } },
  'WezTerm from Nix, 2019': { env: { ...xterm, TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '0-unstable-2019-01-01' } },
  'VS Code 1.72.0': { env: { ...xterm, TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.72.0' } },
  'VS Code 1.71.9': { env: { ...xterm, TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.71.9' } },
  'VS Code 2.0': { env: { ...xterm, TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '2.0' } },
  'Cursor 0.40': { env: { ...xterm, TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '0.40', CURSOR_TRACE_ID: 'x' } },
  'VS Code without TERM or COLORTERM': { env: { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.80.0' } },
  'VS Code without TERM, COLORTERM set': { env: { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.80.0', COLORTERM: '1' } },
  ghostty: { env: { ...xterm, TERM_PROGRAM: 'ghostty' } },
  zed: { env: { ...xterm, TERM_PROGRAM: 'zed' } },
  Orca: { env: { ...xterm, TERM_PROGRAM: 'Orca' } },
  Hyper: { env: { ...xterm, TERM_PROGRAM: 'Hyper' } },
  'Terminal.app': { env: { ...xterm, TERM_PROGRAM: 'Apple_Terminal', TERM_PROGRAM_VERSION: '453' } },
  'an unknown TERM_PROGRAM on VTE 0.60': { env: { ...xterm, TERM_PROGRAM: 'tmux', VTE_VERSION: '6003' } },
  'VTE 0.50.0, which segfaults': { env: { ...xterm, VTE_VERSION: '0.50.0' } },
  'VTE 0.50.1': { env: { ...xterm, VTE_VERSION: '0.50.1' } },
  'VTE 4999': { env: { ...xterm, VTE_VERSION: '4999' } },
  'VTE 5000': { env: { ...xterm, VTE_VERSION: '5000' } },
  'VTE with a non-numeric major': { env: { ...xterm, VTE_VERSION: 'x.60' } },
  alacritty: { env: { TERM: 'alacritty', COLORTERM: 'truecolor' } },
  kitty: { env: { TERM: 'xterm-kitty' } },
  'Windows Terminal on Linux': { env: { ...xterm, WT_SESSION: 'x' } },
  'Windows Terminal on win32': { env: { WT_SESSION: 'x' }, platform: 'win32' },
  'win32 without Windows Terminal': { env: iterm, platform: 'win32' },
  'CI on GitHub Actions': { env: { ...iterm, CI: 'true', GITHUB_ACTIONS: 'true' } },
  'CI on GitHub Actions under Windows Terminal': { env: { ...xterm, CI: 'true', GITHUB_ACTIONS: 'true', WT_SESSION: 'x' } },
  'an unknown CI under Windows Terminal': { env: { ...xterm, CI: 'true', WT_SESSION: 'x' } },
  'an empty CI': { env: { ...iterm, CI: '' } },
  TeamCity: { env: { ...iterm, TEAMCITY_VERSION: '2023.1' } },
  'FORCE_HYPERLINK=1, piped': { env: { FORCE_HYPERLINK: '1' }, tty: false },
  'FORCE_HYPERLINK=0 in iTerm2': { env: { ...iterm, FORCE_HYPERLINK: '0' } },
  'FORCE_HYPERLINK empty': { env: { ...iterm, FORCE_HYPERLINK: '' } },
  'FORCE_HYPERLINK=yes': { env: { FORCE_HYPERLINK: 'yes' }, tty: false },
  '--no-hyperlink in iTerm2': { env: iterm, argv: ['--no-hyperlink'] },
  '--no-hyperlink after --': { env: iterm, argv: ['--', '--no-hyperlink'] },
  '--hyperlink=always, piped': { env: {}, argv: ['--hyperlink=always'], tty: false },
  'NETLIFY, piped': { env: { NETLIFY: 'true' }, tty: false },
  'iTerm2, piped': { env: iterm, tty: false },
  'FORCE_COLOR=0 in iTerm2': { env: { ...iterm, FORCE_COLOR: '0' } },
  'FORCE_COLOR=false in iTerm2': { env: { ...iterm, FORCE_COLOR: 'false' } },
  'FORCE_COLOR=abc in iTerm2': { env: { ...iterm, FORCE_COLOR: 'abc' } },
  '--no-color in iTerm2': { env: iterm, argv: ['--no-color'] },
  'FORCE_COLOR=1 beats --no-color': { env: { ...iterm, FORCE_COLOR: '1' }, argv: ['--no-color'] },
  'TERM=dumb under Windows Terminal': { env: { TERM: 'dumb', WT_SESSION: 'x' } },
  'TERM=dumb under Windows Terminal, FORCE_COLOR=1': { env: { TERM: 'dumb', WT_SESSION: 'x', FORCE_COLOR: '1' } },
  'Azure Pipelines, piped': { env: { ...iterm, TF_BUILD: 'True', AGENT_NAME: 'a' }, tty: false },
  'no environment at all': { env: {} },
};

const incumbentUrl = import.meta.resolve('supports-hyperlinks');

/** The incumbent's answer, from a process that has seen nothing but this case. */
function incumbent({ env, argv = [], platform = 'linux', tty = true }: Case): boolean {
  const script = `const [p, argv, tty, url] = JSON.parse(process.argv[1]);
Object.defineProperty(process, 'platform', { value: p });
process.argv = [process.execPath, 'cli.js', ...argv];
const { createSupportsHyperlinks } = await import(url);
process.stdout.write(String(createSupportsHyperlinks({ isTTY: tty })));`;
  // eslint-disable-next-line node-security/detect-child-process -- `spawn` with an argument array and no shell: Node's own execPath, a script literal above and a JSON argument built from this file's table. Nothing reaches a command line.
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([platform, argv, tty, incumbentUrl])], { env, encoding: 'utf8' });
  expect(run.stderr, 'the incumbent did not answer').toBe('');
  return run.stdout === 'true';
}

/** The façade's answer, read from the string it returns: OSC 8, or the fallback. */
function facade({ env, argv = [], platform = 'linux', tty = true }: Case): boolean {
  const link = terminalLinkFor({ env, isTTY: { stdout: tty }, argv: [process.execPath, 'cli.js', ...argv], platform });
  return link('docs', 'https://example.com').includes('\u001B]8;;');
}

describe('paratext/terminal-link links where supports-hyperlinks 4.5.0 does (A27)', () => {
  it.each(Object.entries(CASES))('%s', (_name, c) => {
    expect(facade(c)).toBe(incumbent(c));
  });

  it('asks about stderr when the call is bound for stderr', () => {
    const runtime = { env: iterm, isTTY: { stdout: false, stderr: true }, argv: [], platform: 'linux' };
    expect(terminalLinkFor(runtime)('a', 'b', { target: 'stderr' })).toContain('\u001B]8;;');
    expect(terminalLinkFor(runtime)('a', 'b')).toBe('a b');
  });
});
