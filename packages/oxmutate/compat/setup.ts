/**
 * The vendored specs are Mocha-style (`describe`/`it` as globals, chai's `expect`). `it` is
 * wrapped so a test named in NOT_APPLICABLE is skipped by name, with no edit to the spec.
 *
 * The grade needs the native core (`npm run build:native`), as the end-to-end tests do: without
 * one it skips, unless OXMUTATE_REQUIRE_NATIVE is set (quality-full.yml), where it fails instead.
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { it as vitestIt } from 'vitest';

import { NOT_APPLICABLE } from './not-applicable.js';

const binding = fileURLToPath(new URL('../binding', import.meta.url));
const native = existsSync(binding) && readdirSync(binding).some((f) => f.endsWith('.node'));
if (!native && process.env['OXMUTATE_REQUIRE_NATIVE'] === '1') throw new Error('OXMUTATE_REQUIRE_NATIVE is set and no native core is built. fix: npm run build:native -w oxmutate');

type Body = () => unknown;
const it = (name: string, body?: Body): void => {
  if (!native || name in NOT_APPLICABLE) vitestIt.skip(name, body);
  else vitestIt(name, body);
};
(globalThis as { it?: unknown }).it = Object.assign(it, { skip: vitestIt.skip, only: vitestIt.only });
