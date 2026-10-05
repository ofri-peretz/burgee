/**
 * R16 — the widget contract lock, controlroom's side.
 *
 * `widget-contract.d.ts` here is a copy of flagstaff's pinned surface: `Component`, `Writer`,
 * `Clock`, and the frame seam. flagstaff's lock holds what flagstaff publishes to that file;
 * this one holds controlroom to it from the other side, as text (the copy is byte for byte
 * flagstaff's) and as types (what controlroom imports from flagstaff is the pinned shape, both
 * directions, checked by `npm run typecheck`). Neither side can change the contract alone.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type Clock, type FrameWriter, frameWriter, type Writer } from 'flagstaff/loop';
import { type Component } from 'flagstaff/plugin';
import { describe, expect, expectTypeOf, it } from 'vitest';

// eslint-disable-next-line import-next/consistent-type-specifier-style -- a declaration file has no module to load: inline `type` specifiers leave `import './widget-contract.js'` behind under verbatimModuleSyntax, and that fails at runtime
import type { Clock as PinnedClock, Component as PinnedComponent, FrameWriter as PinnedFrameWriter, frameWriter as pinnedFrameWriter, Writer as PinnedWriter } from './widget-contract.js';

const read = (url: URL): string => readFileSync(fileURLToPath(url), 'utf8');

describe('controlroom R16 · the widget contract, controlroom’s side', () => {
  it('the copy is flagstaff’s pinned file, byte for byte', () => {
    expect(read(new URL('widget-contract.d.ts', import.meta.url)), 'flagstaff changed the contract: copy packages/flagstaff/src/widget-contract.d.ts here, and adapt controlroom').toBe(
      read(new URL('../../flagstaff/src/widget-contract.d.ts', import.meta.url)),
    );
  });

  it('what controlroom imports from flagstaff is the pinned shape, both ways', () => {
    expectTypeOf<Writer>().toEqualTypeOf<PinnedWriter>();
    expectTypeOf<Clock>().toEqualTypeOf<PinnedClock>();
    expectTypeOf<Component<string>>().toEqualTypeOf<PinnedComponent<string>>();
    expectTypeOf<FrameWriter>().toEqualTypeOf<PinnedFrameWriter>();
    expectTypeOf(frameWriter).toEqualTypeOf<typeof pinnedFrameWriter>();
  });
});
