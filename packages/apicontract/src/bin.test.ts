import { expect, it, vi } from 'vitest';

const run = vi.fn();
vi.mock('burgee', async (load) => ({ ...(await load<typeof import('burgee')>()), run }));

it('hands the declared program to burgee, and nothing else', async () => {
  await import('./bin.js');
  const { program } = await import('./cli.js');
  expect(run).toHaveBeenCalledExactlyOnceWith(program);
});
