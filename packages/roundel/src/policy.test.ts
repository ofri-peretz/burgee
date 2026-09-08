/**
 * R1 and R2 — the truth table. One answer per input, and every input that matters is a
 * row here: mode × env × TTY × json. The check that would have caught clack #286 (five
 * libraries disagreeing about the terminal) is that this table exists and nothing else in
 * the family computes its own.
 */
import { describe, expect, it } from 'vitest';

import { colorLevel, outputMode, type OutputMode, type Runtime } from './policy.js';

function rt(env: Runtime['env'], tty: boolean): Runtime {
  return { env, isTTY: { stdout: tty } };
}

describe('outputMode — R1, first match wins', () => {
  // Every combination of the three switches and the flag: 2 × 2 × 2 × 2 rows.
  const both = { CLI_ACCESSIBLE: '1', CI: 'true' };
  const A = { CLI_ACCESSIBLE: '1' };
  const CI = { CI: 'true' };
  it.each<{ name: string; env: Runtime['env']; tty: boolean; json: boolean; mode: OutputMode }>([
    { name: 'nothing set, a terminal', env: {}, tty: true, json: false, mode: 'tty' },
    { name: 'nothing set, a pipe', env: {}, tty: false, json: false, mode: 'pipe' },
    { name: 'CI on a terminal is still a terminal', env: CI, tty: true, json: false, mode: 'tty' },
    { name: 'CI on a pipe', env: CI, tty: false, json: false, mode: 'ci' },
    { name: 'accessible on a terminal', env: A, tty: true, json: false, mode: 'accessible' },
    { name: 'accessible on a pipe', env: A, tty: false, json: false, mode: 'accessible' },
    { name: 'accessible beats CI', env: both, tty: true, json: false, mode: 'accessible' },
    { name: 'accessible beats CI on a pipe', env: both, tty: false, json: false, mode: 'accessible' },
    { name: '--json on a terminal', env: {}, tty: true, json: true, mode: 'json' },
    { name: '--json on a pipe', env: {}, tty: false, json: true, mode: 'json' },
    { name: '--json beats CI', env: CI, tty: true, json: true, mode: 'json' },
    { name: '--json beats CI on a pipe', env: CI, tty: false, json: true, mode: 'json' },
    { name: '--json beats accessible', env: A, tty: true, json: true, mode: 'json' },
    { name: '--json beats accessible on a pipe', env: A, tty: false, json: true, mode: 'json' },
    { name: '--json beats everything', env: both, tty: true, json: true, mode: 'json' },
    { name: '--json beats everything on a pipe', env: both, tty: false, json: true, mode: 'json' },
  ])('$name', ({ env, tty, json, mode }) => {
    expect(outputMode(rt(env, tty), { json })).toBe(mode);
  });

  it('an empty variable is not set — the NO_COLOR convention, applied to every switch', () => {
    expect(outputMode(rt({ CI: '', CLI_ACCESSIBLE: '' }, false))).toBe('pipe');
    expect(outputMode(rt({ CI: '', CLI_ACCESSIBLE: '' }, true))).toBe('tty');
  });

  it('reads only what the runtime carries — the same input always gives the same answer', () => {
    const a = rt({ CI: 'true', TERM: 'xterm-256color' }, false);
    expect(outputMode(a)).toBe(outputMode({ ...a, env: { ...a.env } }));
    expect(outputMode(a)).toBe('ci');
  });
});

type Level = 0 | 1 | 2 | 3;

describe('colorLevel — R2, what a terminal reports, with no instruction', () => {
  it.each<[string, Runtime['env'], Level]>([
    ['a terminal with no TERM is chalk level 0', {}, 0],
    ['TERM=xterm', { TERM: 'xterm' }, 1],
    ['TERM=screen', { TERM: 'screen' }, 1],
    ['TERM=linux', { TERM: 'linux' }, 1],
    ['TERM=xterm-256color', { TERM: 'xterm-256color' }, 2],
    ['TERM=screen-256', { TERM: 'screen-256' }, 2],
    ['COLORTERM=truecolor', { COLORTERM: 'truecolor', TERM: 'xterm-256color' }, 3],
    ['COLORTERM=24bit', { COLORTERM: '24bit' }, 3],
    ['COLORTERM set to anything else is 16 colours', { COLORTERM: 'yes' }, 1],
    ['TERM=dumb', { TERM: 'dumb', COLORTERM: 'truecolor' }, 0],
    ['NO_COLOR wins over everything', { NO_COLOR: '1', COLORTERM: 'truecolor', FORCE_COLOR: '3' }, 0],
    ['NO_COLOR empty is not set', { NO_COLOR: '', COLORTERM: 'truecolor' }, 3],
    ['a vendor name without CI is not a CI run, so the terminal decides', { GITHUB_ACTIONS: 'true', TERM: 'xterm' }, 1],
    ['a CI run on a terminal is its vendor’s level, as supports-color has it', { CI: 'true', GITHUB_ACTIONS: 'true', TERM: 'xterm' }, 3],
    ['accessible on a terminal keeps the terminal level: the mode decides redraws, not colour', { CLI_ACCESSIBLE: '1', COLORTERM: 'truecolor' }, 3],
  ])('%s', (_, env, level) => {
    expect(colorLevel(rt(env, true))).toBe(level);
  });

  it('json is 0, even on a truecolor terminal, even when forced: structured output carries no escapes', () => {
    expect(colorLevel(rt({ COLORTERM: 'truecolor' }, true), { json: true })).toBe(0);
    expect(colorLevel(rt({ FORCE_COLOR: '3' }, false), { json: true })).toBe(0);
  });
});

describe('colorLevel — R2 revised 2026-09-08: FORCE_COLOR is the user’s instruction, in any mode', () => {
  // chalk 6.0.0's test/force-color.js, row for row: every fixture there is piped.
  it.each<[string, Runtime['env'], Level]>([
    ['FORCE_COLOR=1 is an exact level, not a minimum', { FORCE_COLOR: '1', COLORTERM: 'truecolor' }, 1],
    ['FORCE_COLOR=2 is an exact level, not a minimum', { FORCE_COLOR: '2', COLORTERM: 'truecolor' }, 2],
    ['FORCE_COLOR=3 enables truecolor', { FORCE_COLOR: '3' }, 3],
    ['FORCE_COLOR=1 overrides CI detection', { FORCE_COLOR: '1', CI: 'true', GITHUB_ACTIONS: 'true' }, 1],
    ['FORCE_COLOR=1 overrides TERM detection', { FORCE_COLOR: '1', TERM: 'xterm-256color' }, 1],
    ['a FORCE_COLOR above 3 is clamped to 3', { FORCE_COLOR: '4', TERM: 'xterm-256color' }, 3],
    ['FORCE_COLOR=0 disables colour', { FORCE_COLOR: '0', COLORTERM: 'truecolor' }, 0],
    ['FORCE_COLOR=true only enables colour: COLORTERM decides', { FORCE_COLOR: 'true', COLORTERM: 'truecolor' }, 3],
    ['FORCE_COLOR=true only enables colour: TERM decides', { FORCE_COLOR: 'true', TERM: 'xterm-256color' }, 2],
    ['FORCE_COLOR=true with nothing to detect is level 1', { FORCE_COLOR: 'true' }, 1],
    ['an empty FORCE_COLOR behaves like FORCE_COLOR=true', { FORCE_COLOR: '', COLORTERM: 'truecolor' }, 3],
    ['FORCE_COLOR=false disables colour', { FORCE_COLOR: 'false', COLORTERM: 'truecolor' }, 0],
    ['a non-numeric FORCE_COLOR is unset, so a pipe is 0', { FORCE_COLOR: 'unicorn', COLORTERM: 'truecolor' }, 0],
    ['a non-numeric FORCE_COLOR is unset, not off: Azure still colours', { FORCE_COLOR: 'unicorn', TF_BUILD: '1', AGENT_NAME: 'agent' }, 1],
    ['FORCE_COLOR=0 is off, so Azure does not colour', { FORCE_COLOR: '0', TF_BUILD: '1', AGENT_NAME: 'agent' }, 0],
    ['FORCE_COLOR=true on a dumb terminal is still level 1', { FORCE_COLOR: 'true', TERM: 'dumb' }, 1],
  ])('%s', (_, env, level) => {
    expect(colorLevel(rt(env, false))).toBe(level);
  });

  it.each([' 2', '2 ', '2abc', '+2', '1e1', '0x2'])('a partly numeric FORCE_COLOR (%j) is unset, not a level', (value) => {
    expect(colorLevel(rt({ FORCE_COLOR: value, COLORTERM: 'truecolor' }, false))).toBe(0);
    expect(colorLevel(rt({ FORCE_COLOR: value, TF_BUILD: '1', AGENT_NAME: 'agent' }, false))).toBe(1);
  });

  it('the same instruction, on a terminal', () => {
    expect(colorLevel(rt({ TERM: 'dumb', FORCE_COLOR: '2' }, true))).toBe(2);
    expect(colorLevel(rt({ FORCE_COLOR: '1', COLORTERM: 'truecolor' }, true))).toBe(1);
    expect(colorLevel(rt({ FORCE_COLOR: '9' }, true))).toBe(3);
  });
});

const flags = (argv: string[], env: Runtime['env'] = {}, tty = false): Runtime => ({ env, isTTY: { stdout: tty }, argv });

describe('colorLevel — the --color flags, when the caller hands over argv', () => {
  it.each<[string, string[], Runtime['env'], Level]>([
    ['--color=256 beats a numeric FORCE_COLOR', ['--color=256'], { FORCE_COLOR: '1' }, 2],
    ['--color=16m beats a numeric FORCE_COLOR', ['--color=16m'], { FORCE_COLOR: '1' }, 3],
    ['--color=truecolor', ['--color=truecolor'], {}, 3],
    ['--color=24bit', ['--color=24bit'], {}, 3],
    ['--color enables and detects: nothing to detect is 1', ['--color'], {}, 1],
    ['--color enables and detects: COLORTERM decides', ['--color'], { COLORTERM: 'truecolor' }, 3],
    ['--color=true', ['--color=true'], { TERM: 'xterm-256color' }, 2],
    ['--color=always', ['--color=always'], {}, 1],
    ['--no-color beats FORCE_COLOR=3', ['--no-color'], { FORCE_COLOR: '3' }, 0],
    ['--color=false', ['--color=false'], { FORCE_COLOR: '3' }, 0],
    ['--color=never', ['--color=never'], { FORCE_COLOR: '3' }, 0],
    ['off outranks an exact level, whichever comes first', ['--color=16m', '--no-color'], {}, 0],
    ['an exact level outranks on', ['--color', '--color=256'], { COLORTERM: 'truecolor' }, 2],
    ['a flag after -- belongs to the program, not to the terminal', ['--', '--color=16m'], {}, 0],
    ['an unknown --color value is no instruction', ['--color=lots'], {}, 0],
    ['NO_COLOR beats every flag', ['--color=16m'], { NO_COLOR: '1' }, 0],
  ])('%s', (_, argv, env, level) => {
    expect(colorLevel(flags(argv, env))).toBe(level);
  });

  it('a runtime without argv reads no flags', () => {
    expect(colorLevel(rt({}, true))).toBe(0);
  });
});

describe('colorLevel — a pipe nobody asked to colour is 0, whichever runner it is on', () => {
  // supports-color reads its CI table only once it is detecting at all — a TTY, or a run
  // that asked. On a bare pipe it returns 0 first, and chalk's own `level.js` asserts that
  // ("disable colors if they are not supported" spawns a piped fixture). Azure Pipelines is
  // the single exception, because that check sits above the non-TTY one.
  it.each<[string, Runtime['env'], Level]>([
    ['a bare pipe', { COLORTERM: 'truecolor', TERM: 'xterm-256color' }, 0],
    ['CI alone names no vendor', { CI: 'true', COLORTERM: 'truecolor' }, 0],
    ['GitHub Actions', { CI: 'true', GITHUB_ACTIONS: 'true' }, 0],
    ['Gitea Actions', { CI: 'true', GITEA_ACTIONS: 'true' }, 0],
    ['CircleCI', { CI: 'true', CIRCLECI: 'true' }, 0],
    ['Travis', { CI: 'true', TRAVIS: 'true' }, 0],
    ['Codeship, by CI_NAME', { CI: 'true', CI_NAME: 'codeship' }, 0],
    ['Azure Pipelines is the exception: TF_BUILD and AGENT_NAME both', { TF_BUILD: '1', AGENT_NAME: 'agent' }, 1],
    ['TF_BUILD alone is not Azure', { TF_BUILD: '1' }, 0],
    ['Azure under NO_COLOR is 0', { TF_BUILD: '1', AGENT_NAME: 'agent', NO_COLOR: '1' }, 0],
  ])('%s', (_, env, level) => {
    expect(colorLevel(rt(env, false))).toBe(level);
  });
});

describe('colorLevel — the CI vendor table, once the run has asked for colour', () => {
  // The revision's whole point: the CI user who exports FORCE_COLOR to get coloured logs
  // gets their runner's colours. `CI` gates the table, as it gates supports-color's.
  it.each<[string, Runtime['env'], Level]>([
    ['GitHub Actions renders truecolor', { CI: 'true', GITHUB_ACTIONS: 'true' }, 3],
    ['Gitea Actions renders truecolor', { CI: 'true', GITEA_ACTIONS: 'true' }, 3],
    ['CircleCI renders truecolor', { CI: 'true', CIRCLECI: 'true' }, 3],
    ['Travis', { CI: 'true', TRAVIS: 'true' }, 1],
    ['AppVeyor', { CI: 'true', APPVEYOR: 'true' }, 1],
    ['GitLab CI', { CI: 'true', GITLAB_CI: 'true' }, 1],
    ['Buildkite', { CI: 'true', BUILDKITE: 'true' }, 1],
    ['Drone', { CI: 'true', DRONE: 'true' }, 1],
    ['Codeship, by CI_NAME', { CI: 'true', CI_NAME: 'codeship' }, 1],
    ['a CI run on no known vendor is only what was asked', { CI: 'true', COLORTERM: 'truecolor' }, 1],
  ])('%s under FORCE_COLOR=true', (_, env, level) => {
    expect(colorLevel(rt({ ...env, FORCE_COLOR: 'true' }, false))).toBe(level);
  });

  it('an exact FORCE_COLOR still outranks the table', () => {
    expect(colorLevel(rt({ CI: 'true', GITHUB_ACTIONS: 'true', FORCE_COLOR: '1' }, false))).toBe(1);
    expect(colorLevel(rt({ CI: 'true', GITHUB_ACTIONS: 'true', FORCE_COLOR: '0' }, false))).toBe(0);
  });

  it('NO_COLOR still outranks the table', () => {
    expect(colorLevel(rt({ CI: 'true', GITHUB_ACTIONS: 'true', FORCE_COLOR: 'true', NO_COLOR: '1' }, false))).toBe(0);
  });

  it('no CI, no table: what the terminal reports', () => {
    expect(colorLevel(rt({ TRAVIS: 'true', FORCE_COLOR: 'true', COLORTERM: 'truecolor' }, false))).toBe(3);
  });
});
