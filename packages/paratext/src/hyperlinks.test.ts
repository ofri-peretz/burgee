/**
 * `paratext/terminal-link` links exactly where `supports-hyperlinks` 4.5.0 says to (A27).
 *
 * Each case is asked of the real incumbent in a child process of its own — `supports-color`
 * keeps `--color` state in a module global that an earlier case's `FORCE_COLOR` overwrites,
 * so one process asked sixty questions would answer some of them from history — and of the
 * façade through `terminalLinkFor`, which is the path a caller takes. The façade that read
 * `LINK.when` failed 30 of the first 56. The incumbent says yes to 34 of the 62 environments,
 * so agreement cannot come from both sides answering the same thing everywhere.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { hasColor } from './hyperlinks.js';
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
  // On a terminal whose colour the environment does not settle — `TERM=dumb`, which leaves
  // `supports-color` at its forced level — so each of these is the one clause deciding.
  'TERM=dumb under Windows Terminal, FORCE_COLOR=true': { env: { TERM: 'dumb', WT_SESSION: 'x', FORCE_COLOR: 'true' } },
  'TERM=dumb under Windows Terminal, FORCE_COLOR empty': { env: { TERM: 'dumb', WT_SESSION: 'x', FORCE_COLOR: '' } },
  'TERM=dumb under Windows Terminal, --color': { env: { TERM: 'dumb', WT_SESSION: 'x' }, argv: ['--color'] },
  'TERM=dumb under Windows Terminal, --color=256': { env: { TERM: 'dumb', WT_SESSION: 'x' }, argv: ['--color=256'] },
  'TERM=dumb under Windows Terminal, Azure Pipelines': { env: { TERM: 'dumb', WT_SESSION: 'x', TF_BUILD: 'True', AGENT_NAME: 'a' } },
  'TERM=dumb under Windows Terminal, TF_BUILD without AGENT_NAME': { env: { TERM: 'dumb', WT_SESSION: 'x', TF_BUILD: 'True' } },
  'truecolor with no TERM and no TERM_PROGRAM': { env: { COLORTERM: 'truecolor' } },
  'no environment at all': { env: {} },
  // Every spelling in each flag table, each where it is the clause that decides.
  '--no-hyperlinks in iTerm2': { env: iterm, argv: ['--no-hyperlinks'] },
  '--hyperlink=false in iTerm2': { env: iterm, argv: ['--hyperlink=false'] },
  '--hyperlink=never in iTerm2': { env: iterm, argv: ['--hyperlink=never'] },
  '--no-hyperlink before --': { env: iterm, argv: ['--no-hyperlink', '--'] },
  '--hyperlink=true, piped': { env: {}, argv: ['--hyperlink=true'], tty: false },
  '--no-colors in iTerm2': { env: iterm, argv: ['--no-colors'] },
  '--color=false in iTerm2': { env: iterm, argv: ['--color=false'] },
  '--color=never in iTerm2': { env: iterm, argv: ['--color=never'] },
  'TERM=dumb under Windows Terminal, --colors': { env: { TERM: 'dumb', WT_SESSION: 'x' }, argv: ['--colors'] },
  'TERM=dumb under Windows Terminal, --color=true': { env: { TERM: 'dumb', WT_SESSION: 'x' }, argv: ['--color=true'] },
  'TERM=dumb under Windows Terminal, --color=always': { env: { TERM: 'dumb', WT_SESSION: 'x' }, argv: ['--color=always'] },
  'TERM=dumb under Windows Terminal, --color=16m': { env: { TERM: 'dumb', WT_SESSION: 'x' }, argv: ['--color=16m'] },
  'TERM=dumb under Windows Terminal, --color=full': { env: { TERM: 'dumb', WT_SESSION: 'x' }, argv: ['--color=full'] },
  'TERM=dumb under Windows Terminal, --color=truecolor': { env: { TERM: 'dumb', WT_SESSION: 'x' }, argv: ['--color=truecolor'] },
  // `FORCE_COLOR` read as a level, on a terminal whose colour only the level can settle.
  'FORCE_COLOR=-1 on a dumb ghostty': { env: { TERM: 'dumb', TERM_PROGRAM: 'ghostty', FORCE_COLOR: '-1' } },
  'FORCE_COLOR=3 on a dumb ghostty': { env: { TERM: 'dumb', TERM_PROGRAM: 'ghostty', FORCE_COLOR: '3' } },
  'FORCE_COLOR=9 on a dumb ghostty': { env: { TERM: 'dumb', TERM_PROGRAM: 'ghostty', FORCE_COLOR: '9' } },
  'FORCE_HYPERLINK empty, piped': { env: { FORCE_HYPERLINK: '' }, tty: false },
  // An empty `CI` is present for `supports-color` and absent for `supports-hyperlinks`, so the
  // provider is the one thing deciding the colour of a terminal that would otherwise link.
  ...Object.fromEntries(
    ['GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI', 'TRAVIS', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE'].map((name) => [`an empty CI on ${name}, in ghostty`, { env: { CI: '', [name]: 'true', TERM_PROGRAM: 'ghostty' } }]),
  ),
  'an empty CI on Codeship, in ghostty': { env: { CI: '', CI_NAME: 'codeship', TERM_PROGRAM: 'ghostty' } },
  'an empty TEAMCITY_VERSION in kitty': { env: { TEAMCITY_VERSION: '', TERM: 'xterm-kitty' } },
  'TERM=dumb with COLORTERM=truecolor, in ghostty': { env: { TERM: 'dumb', COLORTERM: 'truecolor', TERM_PROGRAM: 'ghostty' } },
  // Colour from `TERM` or `TERM_PROGRAM` alone, in a terminal that links whenever there is colour.
  'TERM=wezterm in ghostty': { env: { TERM: 'wezterm', TERM_PROGRAM: 'ghostty' } },
  'TERM=xterm in ghostty': { env: { TERM: 'xterm', TERM_PROGRAM: 'ghostty' } },
  'TERM=foo-256 in ghostty': { env: { TERM: 'foo-256', TERM_PROGRAM: 'ghostty' } },
  'TERM=foo-256x in ghostty': { env: { TERM: 'foo-256x', TERM_PROGRAM: 'ghostty' } },
  ...Object.fromEntries(['myscreen', 'myxterm', 'myvt100', 'myvt220', 'myrxvt'].map((term) => [`TERM=${term} in ghostty`, { env: { TERM: term, TERM_PROGRAM: 'ghostty' } }])),
  'iTerm2 3.1.0 with no TERM': { env: { TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.1.0' } },
  'Terminal.app on VTE with no TERM': { env: { TERM_PROGRAM: 'Apple_Terminal', VTE_VERSION: '6003' } },
  // Versions at the edges of upstream's reader.
  'VTE 1.0.0': { env: { ...xterm, VTE_VERSION: '1.0.0' } },
  'VTE 500': { env: { ...xterm, VTE_VERSION: '500' } },
  'VTE 999': { env: { ...xterm, VTE_VERSION: '999' } },
  'VTE x5001': { env: { ...xterm, VTE_VERSION: 'x5001' } },
  'WezTerm from Nix, a suffix after the date': { env: { ...xterm, TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '0-unstable-2021-01-01-x' } },
  'WezTerm from Nix, a prefix before it': { env: { ...xterm, TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: 'xx0-unstable-2021-01-01' } },
};

const incumbentUrl = import.meta.resolve('supports-hyperlinks');

/** The incumbent's answer, from a process that has seen nothing but this case. */
function incumbent({ env, argv = [], platform = 'linux', tty = true }: Case): boolean {
  const script = `const [p, argv, tty, url] = JSON.parse(process.argv[1]);
Object.defineProperty(process, 'platform', { value: p });
process.argv = [process.execPath, 'cli.js', ...argv];
const { createSupportsHyperlinks } = await import(url);
process.stdout.write(String(createSupportsHyperlinks({ isTTY: tty })));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([platform, argv, tty, incumbentUrl])], { env, encoding: 'utf8' });
  expect(run.stderr, 'the incumbent did not answer').toBe('');
  return run.stdout === 'true';
}

/** The façade's answer, read from the string it returns: OSC 8, or the fallback. */
function facade({ env, argv = [], platform = 'linux', tty = true }: Case): boolean {
  const link = terminalLinkFor({ env, isTTY: { stdout: tty }, argv: [process.execPath, 'cli.js', ...argv], platform });
  return link('docs', 'https://example.com').includes('\u001B]8;;');
}

// The incumbent's answers do not depend on this package's code, so they are asked once per
// supports-hyperlinks version and case list and kept under node_modules/.cache. A mutation run loads
// this file hundreds of times, and a process per case each time was 150 of 183 s of an oxmutate run
// on paratext (2026-10-30). A new version or a changed case asks the incumbent again.
const incumbentDir = path.dirname(fileURLToPath(incumbentUrl));
const incumbentVersion = (JSON.parse(readFileSync(path.join(incumbentDir, 'package.json'), 'utf8')) as { version: string }).version;
const cacheKey = createHash('sha256').update(`${incumbentVersion}\n${JSON.stringify(CASES)}`).digest('hex').slice(0, 16);
const cacheFile = path.join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', '.cache', `a27-incumbent-${cacheKey}.json`);

function incumbentAnswers(): Record<string, boolean> {
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as Record<string, boolean>;
  } catch {
    const answers = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, incumbent(c)]));
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(answers));
    return answers;
  }
}

describe('paratext/terminal-link links where supports-hyperlinks 4.5.0 does (A27)', () => {
  const answers = incumbentAnswers();
  it.each(Object.entries(CASES))('%s', (name, c) => {
    expect(facade(c)).toBe(answers[name]);
  });

  it('asks about stderr when the call is bound for stderr', () => {
    const runtime = { env: iterm, isTTY: { stdout: false, stderr: true }, argv: [], platform: 'linux' };
    expect(terminalLinkFor(runtime)('a', 'b', { target: 'stderr' })).toContain('\u001B]8;;');
    expect(terminalLinkFor(runtime)('a', 'b')).toBe('a b');
  });

  it('takes stderr to be stdout when the runtime says nothing about stderr', () => {
    const on = { env: iterm, isTTY: { stdout: true }, argv: [], platform: 'linux' };
    const off = { ...on, isTTY: { stdout: false } };
    expect(terminalLinkFor(on)('a', 'b', { target: 'stderr' })).toContain('\u001B]8;;');
    expect(terminalLinkFor(off)('a', 'b', { target: 'stderr' })).toBe('a b');
  });

  it('reads a runtime with no argv or platform as no flags on a platform that is not win32', () => {
    // `Runtime.argv` and `.platform` are optional, and every other caller of the type leaves
    // them out: a runtime built for the root must not lose its links here, or throw.
    expect(terminalLinkFor({ env: iterm, isTTY: { stdout: true } })('a', 'b')).toContain('\u001B]8;;');
  });
});

/**
 * TeamCity's colour, asked of `hasColor` directly: `supportsHyperlinks` refuses any non-empty
 * `TEAMCITY_VERSION` after asking, so its answer never shows through a link. The expectations
 * are supports-color 10.2.2's own, read from it on 2026-11-04: 9.1 and every later minor of 9,
 * and every major of two digits, have colour.
 */
describe('TeamCity colour, by version', () => {
  it.each([
    ['9.1.0', true],
    ['9.01.0', true],
    ['9.10.0', true],
    ['9.100.0', true],
    ['2023.1', true],
    ['9.0.1', false],
    ['8.1.0', false],
    ['x10.0', false],
  ])('TEAMCITY_VERSION=%s has colour: %s', (version, expected) => {
    expect(hasColor({ TEAMCITY_VERSION: version }, [], 'linux')).toBe(expected);
  });
});
