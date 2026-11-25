import { expect, it, vi } from 'vitest';

// The module loads under a stand-in `process` whose `env` is the test's own, as a test that
// emulates another platform does (bellpull's node-which-windows.test.ts).
vi.stubGlobal('process', Object.create(process, { env: { value: { PATHEXT: '' } } }));
const { EXTS } = await import('./exts.js');
vi.unstubAllGlobals();

it('lists both extensions', () => {
  expect(EXTS).toEqual(['.EXE', '.CMD']);
});
