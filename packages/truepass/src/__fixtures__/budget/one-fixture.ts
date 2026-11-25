import { describe, expect, it } from 'vitest';

describe('fixture', () => {
  it('waits (a) little', async () => {
    await new Promise((r) => setTimeout(r, 25));
    expect(1).toBe(1);
  });

  it('is not selected', () => {
    expect(2).toBe(2);
  });
});
