/**
 * B-20261112-burgee-yargs-b5-runtime-over-ceiling: `argsert` parses each usage string once.
 *
 * Every builder method checks its arguments with `argsert('<string> [object]', …)`, and yargs
 * parses that usage string with parse-command on every call. The B5 workload, one `parseSync()` of
 * a 21-option program (`benchmarks/fixtures/runtime/burgee-yargs.mjs`), ran parse-command 70 times
 * to re-parse the same few string literals, and B5 read `burgee/yargs ÷ yargs` over its 1.1 ceiling
 * every night from 2026-11-02. A wall-clock bound cannot hold this on a shared runner; a count of
 * the work can.
 *
 * parse-command tokenises with `String.prototype.matchAll` (`splitOutsideBrackets`), once per
 * call, so counting `matchAll` over a parse counts parse-command (the first case proves the
 * counter sees it). Red on the unfixed code (`f52e164e`): "expected 70 to be +0".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import yargs from '../yargs.js';

import { argsert, parseCommand, usageOf } from './utils.js';

// The B5 workload's program, as `benchmarks/fixtures/runtime/burgee-yargs.mjs` builds it.
const ARGV = ['--verbose', '--port', '8080', '--host', 'example.com', '--no-color', '--tag', 'a', '--tag', 'b', '--dry-run', 'input.txt'];
const STRINGS = ['host', 'mode', 'name', 'out', 'config', 'format', 'region'];
const NUMBERS = ['port', 'retries', 'timeout', 'level', 'depth', 'limit'];
const BOOLEANS = ['verbose', 'dry-run', 'force', 'quiet', 'cache'];

function parse(): Record<string, unknown> {
  let q = yargs(ARGV);
  for (const s of STRINGS) q = q.option(s, { type: 'string' });
  for (const n of NUMBERS) q = q.option(n, { type: 'number' });
  for (const b of BOOLEANS) q = q.option(b, { type: 'boolean' });
  return q.option('color', { type: 'boolean', default: true }).option('tag', { type: 'array', string: true }).parseSync() as Record<string, unknown>;
}

/** How many times parse-command's tokeniser runs while `fn` does. */
function tokenisations(fn: () => unknown): number {
  const matchAll = vi.spyOn(String.prototype, 'matchAll');
  try {
    fn();
    return matchAll.mock.calls.length;
  } finally {
    matchAll.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('argsert parses each usage string once, not once per call', () => {
  it('the counter counts: one parse-command is one tokenisation', () => {
    expect(tokenisations(() => parseCommand('cmd <string> [object]'))).toBe(1);
  });

  it('a second build and parseSync() of the B5 program runs parse-command zero times', () => {
    const first = parse();
    expect(first).toMatchObject({ port: 8080, host: 'example.com', color: false, tag: ['a', 'b'], dryRun: true });
    expect(tokenisations(parse)).toBe(0);
  });

  it('the shared parse is the one parse-command gives, handed out again rather than parsed again', () => {
    const usage = '<string|object> [object|boolean]';
    const parsed = usageOf(usage);
    expect(usageOf(usage)).toBe(parsed);
    expect(parsed).toEqual(parseCommand(`cmd ${usage}`));
  });

  it('argsert still refuses the wrong type and the wrong count, as yargs words it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    argsert('<string> [object]', [1], 1);
    argsert('<string> [object]', ['a', {}, 3], 3);
    argsert('<string> [object]', ['a', {}], 2);
    argsert([], 0);
    argsert(['x'], 1);
    const said = warn.mock.calls.map(([stack]) => String(stack).split('\n')[0]);
    expect(said).toEqual([
      'YError: Invalid first argument. Expected string but received number.',
      'YError: Too many arguments provided. Expected max 2 but received 3.',
      'YError: Too many arguments provided. Expected max 0 but received 1.',
    ]);
  });
});
