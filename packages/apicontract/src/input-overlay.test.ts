/** Stub test created by PLAN.md 6.0; lane `ac-inputs` replaces it. */
import { expect, it } from 'vitest';

import { applyOverlays } from './input-overlay.js';

it('applies no overlay until its lane lands', () => {
  expect(applyOverlays).toBeUndefined();
});
