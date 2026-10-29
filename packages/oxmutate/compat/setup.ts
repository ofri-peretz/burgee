/**
 * The vendored specs are Mocha-style (`describe`/`it` as globals, chai's `expect`). `it` is
 * wrapped so a test named in NOT_APPLICABLE is skipped by name, with no edit to the spec.
 */
import { it as vitestIt } from 'vitest';

import { NOT_APPLICABLE } from './not-applicable.js';

type Body = () => unknown;
const it = (name: string, body?: Body): void => {
  if (name in NOT_APPLICABLE) vitestIt.skip(name, body);
  else vitestIt(name, body);
};
(globalThis as { it?: unknown }).it = Object.assign(it, { skip: vitestIt.skip, only: vitestIt.only });
