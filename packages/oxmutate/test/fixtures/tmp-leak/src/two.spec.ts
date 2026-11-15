import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { two } from './two.js';

// Under a mutant, leaves a directory in the temporary directory and never removes it, as a test a
// kill interrupts does. It names the directory in a marker under the path the e2e test hands it.
it('leaves scratch behind under oxmutate', () => {
  if (process.env['OXMUTATE_MODE'] && process.env['OXMUTATE_MODE'] !== 'dry') {
    const scratch = mkdtempSync(path.join(tmpdir(), 'oxmutate-leak-'));
    const marker = process.env['OXMUTATE_E2E_MARKER'];
    if (marker) writeFileSync(`${marker}.leak-${path.basename(scratch)}`, scratch);
  }
  expect(two()).toBe(2);
});
