/**
 * The skeleton's whole surface: one constant, and nothing that could be mistaken for an API.
 */
import { describe, expect, it } from 'vitest';

import { status } from './index.js';

describe('controlroom, reserved', () => {
  it('says it is reserved', () => {
    expect(status).toBe('reserved');
  });

  it('exports only what is built: the screen (R4–R7, R19), the compositor (R5), layout (R8) and tab state (R9)', async () => {
    expect(Object.keys(await import('./index.js')).sort()).toEqual([
      'collapse', 'compose', 'distribute', 'fit', 'hints', 'initial', 'layout', 'open', 'processRuntime', 'reduce', 'render', 'status',
    ]);
  });
});
