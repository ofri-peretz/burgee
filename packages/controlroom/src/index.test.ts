/**
 * The skeleton's whole surface: one constant, and nothing that could be mistaken for an API.
 */
import { describe, expect, it } from 'vitest';

import { status } from './index.js';

describe('controlroom, reserved', () => {
  it('says it is reserved', () => {
    expect(status).toBe('reserved');
  });

  it('exports only what is built: the screen (R4–R7, R19), the compositor (R5), layout (R8), tab state (R9) and the heights scrolling reads (controlroom-scroll-pane R2)', async () => {
    expect(Object.keys(await import('./index.js')).sort()).toEqual([
      'ScreenError', 'collapse', 'compose', 'distribute', 'extents', 'fit', 'hints', 'initial', 'layout', 'open', 'processRuntime', 'reduce', 'render', 'status',
    ]);
  });
});
