/**
 * `mayServe` (U5): `surfaces.js` loads only for words that might ask for a surface, so a plain
 * command line never pays for it. Each surface's own spelling admits it; anything else does not.
 */
import { describe, expect, it } from 'vitest';

import { mayServe } from './argv.js';

describe('mayServe', () => {
  it('admits each surface by its own spelling', () => {
    for (const argv of [['__complete'], ['completion'], ['help'], ['schema'], ['--mcp'], ['--skill'], ['config', 'explain'], ['go', '--schema']]) expect(mayServe(argv), argv.join(' ')).toBe(true);
  });

  it('admits nothing else, half a spelling and a word after -- included', () => {
    for (const argv of [[], ['greet'], ['config', 'get'], ['show', 'explain'], ['go', '--', '--schema'], ['go', '--mcp']]) expect(mayServe(argv), argv.join(' ')).toBe(false);
  });
});
