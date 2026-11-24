import { expect, it, vi } from 'vitest';

// burgee itself is not loaded: what is under test is the hand-over, not burgee (the same reason
// as truepass's bin test). `cli.test.ts` holds the declaration against the real burgee.
const run = vi.fn();
vi.mock('burgee', () => ({
  run,
  defineCommand: <T>(command: T): T => command,
  defineProgram: <T>(program: T): T => program,
  ExitCode: { RUNTIME: 1 },
  UsageError: class extends Error {},
}));

it('hands the declared program to burgee, and nothing else', async () => {
  await import('./bin.js');
  const { program } = await import('./cli.js');
  expect(run).toHaveBeenCalledExactlyOnceWith(program);
  expect(run.mock.calls[0]?.[0]).toBe(program);
});
