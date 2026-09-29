/**
 * The CLI entry owns exactly three things — argv, stdout and the exit code — and hands
 * everything else to `main`. The exit code is the gate CI reads, so it is the one to pin.
 */
import { afterEach, expect, it, vi } from 'vitest';

import { main } from './report.js';

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

it('passes the arguments after the script to main, prints what it writes, and exits with its verdict', async () => {
  process.argv = ['node', 'bin.js', 'chalk', '--control'];
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  await import('./bin.js');
  expect(vi.mocked(main).mock.calls[0]?.[0]).toEqual(['chalk', '--control']);
  expect(stdout).toHaveBeenCalledWith('graded\n');
  expect(process.exitCode).toBe(3);
});
