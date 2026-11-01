/**
 * The CLI entry owns exactly three things — argv, stdout and the exit code — and hands
 * everything else to `main`. The exit code is the gate CI reads, so it is the one to pin.
 */
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./report.js', () => ({
  main: vi.fn(async (_argv: string[], write: (s: string) => void) => {
    write('graded\n');
    return 3;
  }),
}));

const argv = process.argv;

afterEach(() => {
  process.argv = argv;
  // Left set, it would become this test process's own exit code.
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

/**
 * Evaluates `bin.js` afresh and returns the arguments its `main` received. The entry does its
 * work at import, and an import is cached per worker: imported once at the top of a test, it ran
 * on the first run only, and a second run in the same worker (a retry, or oxmutate's canary)
 * asserted on a `main` nothing had called (2026-11-01).
 */
async function runBin(args: string[]): Promise<unknown> {
  process.argv = ['node', 'bin.js', ...args];
  vi.resetModules();
  await import('./bin.js');
  const { main } = await import('./report.js');
  return vi.mocked(main).mock.calls.at(-1)?.[0];
}

it('passes the arguments after the script to main, prints what it writes, and exits with its verdict', async () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  expect(await runBin(['chalk', '--control'])).toEqual(['chalk', '--control']);
  expect(stdout).toHaveBeenCalledWith('graded\n');
  expect(process.exitCode).toBe(3);
});

it('runs the entry again on a second run in the same worker', async () => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  expect(await runBin(['chalk'])).toEqual(['chalk']);
  expect(await runBin(['ora', '--target'])).toEqual(['ora', '--target']);
  expect(process.exitCode).toBe(3);
});
