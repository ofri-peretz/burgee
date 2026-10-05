/**
 * The skeleton's whole surface: one constant, and nothing that could be mistaken for an API.
 */
import { describe, expect, it } from 'vitest';

import { status } from './index.js';

describe('controlroom, reserved', () => {
  it('says it is reserved', () => {
    expect(status).toBe('reserved');
  });

  it('exports only what is built: the layout (R8) and the tab, focus and collapse state (R9)', async () => {
    expect(Object.keys(await import('./index.js')).sort()).toEqual(['distribute', 'hints', 'initial', 'layout', 'reduce', 'status']);
  });
});
