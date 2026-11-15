import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { one } from './spawn.js';

// Under a mutant, starts a child that would live for ever, names it in a marker under the path the
// e2e test hands it, then spins: the server is killed by the watchdog (or dies with its coordinator)
// while its test's child is still running, and the e2e test checks that the child went with it.
it('starts a child, then spins under oxmutate', () => {
  const mode = process.env['OXMUTATE_MODE'];
  if (mode && mode !== 'dry') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    const marker = process.env['OXMUTATE_E2E_MARKER'];
    if (marker) writeFileSync(`${marker}.child-${String(child.pid)}`, '');
    for (;;);
  }
  expect(one()).toBe(1);
});
