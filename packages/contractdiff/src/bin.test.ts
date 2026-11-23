import { expect, it, vi } from 'vitest';

// burgee itself is not loaded: what is under test is the hand-over, not burgee. Loading it took
// this case to its 30 s limit under the pre-push battery (2026-11-12), for a body that runs in
// milliseconds: through the workspace link, vitest transforms burgee's whole `dist/` graph. The
// two builders answer with what they were given, so `program` is the object `cli.ts` declared, and
// `cli.test.ts` holds that declaration against the real burgee.
const run = vi.fn();
vi.mock('burgee', () => ({ run, defineCommand: <T>(command: T): T => command, defineProgram: <T>(program: T): T => program }));

it('hands the declared program to burgee, and nothing else', async () => {
  await import('./bin.js');
  const { program } = await import('./cli.js');
  expect(run).toHaveBeenCalledExactlyOnceWith(program);
  // The very object, not an equal copy: `toHaveBeenCalledWith` compares deeply.
  expect(run.mock.calls[0]?.[0]).toBe(program);
});
