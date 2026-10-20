/**
 * `roundel/supports-color` — supports-color 11.0.0, which supports-color's own `test.js` grades
 * in `compat-oracle` (`supports-color-drop-in` R1, R2).
 *
 * The suite there is fifty-five chosen environments. This holds the rest of the decision table
 * differentially: a world — environment, flags, platform, Windows build, which descriptors are
 * terminals, a stream and options, and a second environment written after import — goes to
 * supports-color's own installed source, evaluated in a `vm` context whose `process`, `os` and
 * `tty` are that world, and to this module over a `runtime.ts` and `node:os`/`node:tty` that
 * report it. The two must give the same answers, for the import-time defaults and for later
 * calls, which is where supports-color's module state (the flags read once, a set `FORCE_COLOR`
 * written over them) shows.
 *
 * R3 is the last block: the one case where this module and `roundel/policy` must disagree.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script, createContext } from 'node:vm';

import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { colorLevel } from './policy.js';
// Imported at the top as well as fresh per world: the module's import-time code then runs while
// the test file loads, which is when a mutation tool activates a mutant in it.
import supportsColor, { type ColorInfo, createSupportsColor, type Options } from './supports-color.js';

const require = createRequire(import.meta.url);
const SOURCE_PATH = require.resolve('supports-color');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

/** What a caller passes to `createSupportsColor`: a stream or none, and options. */
interface Call {
  stream?: { isTTY?: boolean } | undefined;
  options?: Options;
}

interface World {
  env: Record<string, string>;
  argv: string[];
  platform: string;
  release: string;
  ttys: { 1: boolean; 2: boolean };
  /** Written into the same environment object after import, before `calls`. */
  later: Record<string, string>;
  calls: Call[];
}

interface Answers {
  stdout: ColorInfo;
  stderr: ColorInfo;
  calls: ColorInfo[];
}

/** supports-color's `index.js` as a script: its three imports become the context's, its exports a record. */
function script(source: string): string {
  const body = source
    .replace(/^import \w+ from 'node:\w+';$/gm, '')
    .replace('export function createSupportsColor', 'function createSupportsColor')
    .replace('export default supportsColor;', 'result.value = { supportsColor, createSupportsColor };');
  expect(body, 'supports-color moved on: re-read its index.js before trusting this comparison').not.toMatch(/^(?:import|export) /m);
  return body;
}
// eslint-disable-next-line node-security/detect-eval-with-expression -- the source is supports-color's own installed index.js with its imports and exports rewritten; evaluating it is the comparison, as picocolors.test.ts evaluates picocolors'
const COMPILED = new Script(script(SOURCE));

/** supports-color itself, evaluated in a context that is `world`. */
function incumbent(world: World): Answers {
  const env = { ...world.env };
  const result = {} as { value: { supportsColor: { stdout: ColorInfo; stderr: ColorInfo }; createSupportsColor: (s?: Call['stream'], o?: Options) => ColorInfo } };
  const context = createContext({
    process: { env, argv: world.argv, platform: world.platform },
    os: { release: () => world.release },
    tty: { isatty: (fd: 1 | 2) => world.ttys[fd] },
    result,
  });
  COMPILED.runInContext(context);
  const { supportsColor, createSupportsColor } = result.value;
  Object.assign(env, world.later);
  return { ...supportsColor, calls: world.calls.map((c) => createSupportsColor(c.stream, c.options)) };
}

/** This module, imported fresh over a runtime, `node:os` and `node:tty` that report `world`. */
async function ours(world: World): Promise<Answers> {
  const env = { ...world.env };
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({ proc: { env, argv: world.argv, platform: world.platform } }));
  vi.doMock('node:os', () => ({ default: { release: () => world.release } }));
  vi.doMock('node:tty', () => ({ default: { isatty: (fd: 1 | 2) => world.ttys[fd] } }));
  const { default: supportsColor, createSupportsColor } = await import('./supports-color.js');
  Object.assign(env, world.later);
  return { ...supportsColor, calls: world.calls.map((c) => createSupportsColor(c.stream as never, c.options)) };
}

afterEach(() => {
  vi.doUnmock('./runtime.js');
  vi.doUnmock('node:os');
  vi.doUnmock('node:tty');
});

const FORCE = ['true', 'false', '', '0', '1', '2', '3', '4', '10', '007', 'unicorn', '1abc', ' 2', '1.0'];
// Each anchored name also appears unanchored (`my-screen`), and a `-256color` not at the end, so
// the generator tells a pattern from the same pattern loosened.
const TERMS = ['dumb', 'xterm', 'xterm-256color', 'XTERM-256COLOR', 'screen-256', 'putty-256color', 'xterm-256color-italic', 'screen', 'rxvt', 'vt100', 'vt220', 'my-screen', 'my-xterm', 'my-vt100', 'my-vt220', 'my-rxvt', 'linux', 'cygwin', 'ansi', 'my-color', 'xterm-kitty', 'xterm-ghostty', 'wezterm', 'tmux', ''];

/** Each variable either detector reads, with the values that sit on either side of a rule. */
const VALUES: Readonly<Record<string, readonly string[]>> = {
  FORCE_COLOR: FORCE,
  TERM: TERMS,
  COLORTERM: ['truecolor', '24bit', '1', ''],
  CI: ['true', '', 'false'],
  GITHUB_ACTIONS: ['true'],
  GITEA_ACTIONS: ['true'],
  CIRCLECI: ['true'],
  TRAVIS: ['1'],
  APPVEYOR: ['1'],
  GITLAB_CI: ['1'],
  BUILDKITE: ['1'],
  DRONE: ['1'],
  CI_NAME: ['codeship', 'other', ''],
  TF_BUILD: ['True'],
  AGENT_NAME: ['agent'],
  TEAMCITY_VERSION: ['9.0.5 (build 32523)', '9.1.0 (build 32523)', '9.10.0', '9.01.0', '10.0', '8.0', '2017.1', '9', 'v9.1.0'],
  TERM_PROGRAM: ['iTerm.app', 'Apple_Terminal', 'vscode'],
  TERM_PROGRAM_VERSION: ['3.0.10', '2.9.3', '', '10', 'x'],
  NO_COLOR: ['1'],
  CLI_ACCESSIBLE: ['1'],
};

/** A few variables at a time, so a world reaches deep rows (CI with one vendor, TeamCity alone) often. */
const variables = (max: number): fc.Arbitrary<Record<string, string>> =>
  fc
    .array(fc.oneof(...Object.entries(VALUES).map(([key, values]) => fc.tuple(fc.constant(key), fc.constantFrom(...values)))), { maxLength: max })
    .map((pairs) => Object.fromEntries(pairs));

const FLAGS = ['--color', '--colors', '--no-color', '--no-colors', '--color=true', '--color=always', '--color=false', '--color=never', '--color=256', '--color=16m', '--color=full', '--color=truecolor', '--color=24bit', '-color', '--', 'x'];

const stream = fc.option(fc.record({ isTTY: fc.option(fc.boolean(), { nil: undefined }) }, { requiredKeys: [] }), { nil: undefined });
const options = fc.record({ sniffFlags: fc.boolean(), streamIsTTY: fc.option(fc.boolean(), { nil: undefined }) }, { requiredKeys: [] });

const worlds: fc.Arbitrary<World> = fc.record({
  env: variables(5),
  argv: fc.shuffledSubarray(FLAGS),
  platform: fc.constantFrom('linux', 'darwin', 'win32'),
  release: fc.constantFrom('10.0.10240', '10.0.10586', '10.0.14931', '10.0.22631', '6.3.9600', '11.0.10586', '10.0', '9.0.20000'),
  ttys: fc.record({ 1: fc.boolean(), 2: fc.boolean() }),
  later: variables(2),
  calls: fc.array(fc.record({ stream, options: fc.option(options, { nil: undefined }) }, { requiredKeys: [] }) as fc.Arbitrary<Call>, { maxLength: 3 }),
});

describe('roundel/supports-color answers as supports-color 11 does', () => {
  it(`agrees with ${SOURCE_PATH.split('node_modules/')[1] ?? SOURCE_PATH} on every world`, async () => {
    // Its `exports` names `.` alone, so the manifest is read beside the entry.
    expect(JSON.parse(readFileSync(new URL('package.json', `file://${SOURCE_PATH}`), 'utf8'))).toMatchObject({ version: '11.0.0' });
    await fc.assert(
      fc.asyncProperty(worlds, async (world) => {
        expect(await ours(world)).toEqual(incumbent(world));
      }),
      { numRuns: 3000 },
    );
  });

  // Chosen rows the generator reaches only by chance, each a branch the suite does not pin.
  it.each<[string, Partial<World>, Partial<Answers>]>([
    ['a numeric FORCE_COLOR set after import outranks the flags read at import, and stays', { argv: ['--no-color'], later: { FORCE_COLOR: '2' }, calls: [{}, { options: { sniffFlags: true } }] }, { stdout: false, calls: [{ level: 2, hasBasic: true, has256: true, has16m: false }, { level: 2, hasBasic: true, has256: true, has16m: false }] }],
    ['a stream that is not a terminal and no ask is no colour', { env: { TERM: 'xterm-256color' }, calls: [{ stream: { isTTY: false } }, { stream: {} }] }, { calls: [false, false] }],
    ['no stream at all skips the terminal check', { env: { TERM: 'xterm-256color' }, ttys: { 1: false, 2: false }, calls: [{}] }, { stdout: false, calls: [{ level: 2, hasBasic: true, has256: true, has16m: false }] }],
    ['an own streamIsTTY beats the stream, even undefined', { env: { TERM: 'xterm' }, calls: [{ stream: { isTTY: true }, options: { streamIsTTY: undefined } }, { stream: { isTTY: false }, options: { streamIsTTY: true } }] }, { calls: [false, { level: 1, hasBasic: true, has256: false, has16m: false }] }],
    ['Windows 10 before build 10586 is 16 colours, from it 256, from 14931 truecolor', { platform: 'win32', release: '10.0.10240' }, { stdout: { level: 1, hasBasic: true, has256: false, has16m: false } }],
    ['an iTerm without a version is 256 colours', { env: { TERM_PROGRAM: 'iTerm.app' } }, { stdout: { level: 2, hasBasic: true, has256: true, has16m: false } }],
    ['Codeship is named by a value, not a variable: CI_NAME=codeship is 16 colours', { env: { CI: 'true', CI_NAME: 'codeship' } }, { stdout: { level: 1, hasBasic: true, has256: false, has16m: false } }],
    ['an empty CI_NAME names no runner', { env: { CI: 'true', CI_NAME: '' } }, { stdout: false }],
    ['iTerm 3 is truecolor', { env: { TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.0.10' } }, { stdout: { level: 3, hasBasic: true, has256: true, has16m: true } }],
    ['iTerm 10 is truecolor: the major is the whole number before the first dot', { env: { TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '10.1' } }, { stdout: { level: 3, hasBasic: true, has256: true, has16m: true } }],
    ['TeamCity 9.10 is 16 colours: the minor is read past its first digit', { env: { TEAMCITY_VERSION: '9.10.0' }, calls: [{ options: {} }] }, { stdout: { level: 1, hasBasic: true, has256: false, has16m: false } }],
  ])('%s', async (_, partial, expected) => {
    const world: World = { env: {}, argv: [], platform: 'linux', release: '10.0.0', ttys: { 1: true, 2: true }, later: {}, calls: [], ...partial };
    const answers = await ours(world);
    expect(answers).toEqual(incumbent(world));
    expect(answers).toMatchObject(expected);
  });

  // `TERM` is read with two patterns, one anchored at the end and five alternatives at the start.
  it.each([
    ['xterm-256color-italic', { level: 1, hasBasic: true, has256: false, has16m: false }],
    ['my-screen', false],
    ['my-xterm', false],
    ['my-vt100', false],
    ['my-vt220', false],
    ['my-rxvt', false],
  ] as const)('TERM=%s is read where supports-color anchors it', async (term, stdout) => {
    const world: World = { env: { TERM: term }, argv: [], platform: 'linux', release: '', ttys: { 1: true, 2: true }, later: {}, calls: [] };
    const answers = await ours(world);
    expect(answers.stdout).toEqual(stdout);
    expect(answers).toEqual(incumbent(world));
  });

  it('answers from an empty environment and no flags where there is no process, rather than throwing', async () => {
    vi.resetModules();
    vi.doMock('./runtime.js', () => ({ proc: undefined }));
    vi.doMock('node:tty', () => ({ default: { isatty: () => true } }));
    const { default: supportsColor, createSupportsColor } = await import('./supports-color.js');
    expect(supportsColor).toEqual({ stdout: false, stderr: false });
    expect(createSupportsColor(undefined, { sniffFlags: false })).toBe(false);
  });

  it('reads the real process when nothing is mocked: an object or false for each stream', () => {
    for (const info of [supportsColor.stdout, supportsColor.stderr, createSupportsColor()]) {
      expect(info === false || [1, 2, 3].includes(info.level)).toBe(true);
    }
  });
});

/**
 * R3 — `--no-color` with `FORCE_COLOR=3`. supports-color writes a set `FORCE_COLOR` over the flags
 * and answers 3, and its suite holds every neighbouring row, so the drop-in answers 3.
 * `roundel/policy` refuses colour a user turned off with a flag, and answers 0. Both answers are
 * pinned side by side so a refactor that merged the two tables would fail here, whichever way.
 */
describe('R3 — the one divergence lives on the drop-in only', () => {
  it('answers 3 on roundel/supports-color and 0 on roundel/policy', async () => {
    const world: World = { env: { FORCE_COLOR: '3' }, argv: ['--no-color'], platform: 'linux', release: '', ttys: { 1: true, 2: true }, later: {}, calls: [] };
    const { stdout } = await ours(world);
    expect(stdout).toEqual({ level: 3, hasBasic: true, has256: true, has16m: true });
    expect(incumbent(world).stdout).toEqual(stdout);
    expect(colorLevel({ env: { FORCE_COLOR: '3' }, argv: ['--no-color'], isTTY: { stdout: true } })).toBe(0);
  });

  it('ignores NO_COLOR, which supports-color does not read and roundel/policy obeys', async () => {
    const world: World = { env: { NO_COLOR: '1', TERM: 'xterm-256color' }, argv: [], platform: 'linux', release: '', ttys: { 1: true, 2: true }, later: {}, calls: [] };
    expect((await ours(world)).stdout).toMatchObject({ level: 2 });
    expect(colorLevel({ env: { NO_COLOR: '1', TERM: 'xterm-256color' }, isTTY: { stdout: true } })).toBe(0);
  });
});
