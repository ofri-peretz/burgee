import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { realMachine } from './budget.js';

/** The one case that spawns a real vitest: the rest of the budget's tests pass their own spawn. */
describe('an alone reading, for real', () => {
  it('runs one case of a fixture file under its config and reads how long it took', async () => {
    const dir = join(import.meta.dirname, '__fixtures__', 'budget');
    const ms = await realMachine().measure({
      file: 'one-fixture.ts',
      path: join(dir, 'one-fixture.ts'),
      name: 'fixture > waits (a) little',
      title: 'waits (a) little',
      duration: 6000,
      cwd: join(import.meta.dirname, '..'),
      config: join(dir, 'vitest.config.ts'),
    });
    expect(ms).toBeGreaterThanOrEqual(20);
  });
});
