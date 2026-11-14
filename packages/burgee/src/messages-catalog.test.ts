/**
 * `localised-human-surfaces` R1 — no catalog entry is empty.
 *
 * `messages.test.ts` holds each template to the string its call site writes, read from the
 * syntax tree of `src/`. That is the check that matters, and the mutation run skips it
 * (`scripts/mutation.ts` says why). This is the
 * part of it that needs no source text: an entry blanked to `""` is a template `locale.ts` turns
 * into `/^$/`, which every blank line the engine prints would match, so a pack would put its
 * message where the English had none.
 */
import { describe, expect, it } from 'vitest';

import { MESSAGES } from './messages.js';

describe('the message catalog', () => {
  it.each(Object.entries(MESSAGES))('%s has English to translate', (_id, template) => {
    expect(template.trim()).not.toBe('');
  });
});
