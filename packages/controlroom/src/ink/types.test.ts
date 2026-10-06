/**
 * What ink 8's `style-types.ts` checks, held for `controlroom/ink` where the oracle cannot hold
 * it: `minWidth` and `maxWidth` take cells only (yoga resolves a percentage minimum width
 * against the wrong ancestor, so ink 8 made a string a type error), while the other sizes still
 * take a percentage. The `@ts-expect-error` lines are the assertion — the package's typecheck
 * compiles this file, and an unused directive is an error there.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Box, type BoxProps, renderToString, Text } from './index.js';

const h = React.createElement;

describe('Box size types, as ink 8 types them', () => {
  it('takes cells for the width bounds and percentages for the rest', () => {
    const accepted: BoxProps[] = [{ minWidth: 5, maxWidth: 10 }, { minWidth: undefined, maxWidth: undefined }, { width: '50%', height: '50%', minHeight: '25%', maxHeight: '75%' }];
    // @ts-expect-error A percentage minimum width is not a size ink 8 accepts.
    const minimum: BoxProps = { minWidth: '50%' };
    // @ts-expect-error A percentage maximum width is not a size ink 8 accepts.
    const maximum: BoxProps = { maxWidth: '50%' };
    expect([...accepted, minimum, maximum]).toHaveLength(5);
  });

  it('lays a numeric maximum width out as a bound', () => {
    expect(renderToString(h(Box, { maxWidth: 3 }, h(Text, null, 'abcdef')), { columns: 20 })).toBe('abc\ndef');
  });
});
