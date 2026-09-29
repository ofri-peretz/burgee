/**
 * The cap on how long a cluster `width()` will scan for an emoji sequence.
 *
 * A separate file from `width.test.ts` on purpose: that file and `width.ts` are being rewritten
 * in another branch, and this case holds for both the code on `main` and the code there.
 *
 * `Intl.Segmenter` makes one cluster of a base and every mark after it, however many there are,
 * so a cluster's length is the caller's to choose. The unqualified-emoji check walks the whole
 * cluster; the cap is what keeps a pathological one from turning a width call into a scan. The
 * case below is built so that the cap is the only thing deciding the answer: a real two-pictograph
 * ZWJ sequence, which is two columns, padded past the cap with combining marks.
 */
import { describe, expect, it } from 'vitest';

import { width } from './width.js';

/** U+2764 ZWJ U+1F525, without the U+FE0F that would make `\p{RGI_Emoji}` accept it. */
const HEART_ON_FIRE = '\u2764\u200D\u{1F525}';

describe('a cluster longer than the emoji scan limit', () => {
  it('is an emoji sequence while it is short enough to scan', () => {
    expect(width(HEART_ON_FIRE)).toBe(2);
    expect(width(`${HEART_ON_FIRE}${'\u0301'.repeat(5)}`)).toBe(2);
  });

  it('is not scanned past the limit, and is measured by its base instead', () => {
    // U+2764 alone is one column. Scanned, the same cluster would answer two.
    expect(width(`${HEART_ON_FIRE}${'\u0301'.repeat(60)}`)).toBe(1);
  });
});
