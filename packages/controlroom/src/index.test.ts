/**
 * The skeleton's whole surface: one constant, and nothing that could be mistaken for an API.
 */
import { describe, expect, it } from 'vitest';

import { status } from './index.js';

describe('controlroom, reserved', () => {
  it('says it is reserved', () => {
    expect(status).toBe('reserved');
  });

  it('exports nothing else, so nobody builds on a stub', async () => {
    expect(Object.keys(await import('./index.js'))).toEqual(['status']);
  });
});
