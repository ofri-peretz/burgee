/**
 * `oxmutate/vite`: adds the `mutate` block to Vite's config type, so a Vite or Vite+ project keeps
 * its mutation-testing settings beside `test`, `lint` and `fmt` in one `vite.config.ts`:
 *
 *   /// <reference types="oxmutate/vite" />
 *   import { defineConfig } from 'vite';   // or 'vite-plus'
 *
 *   export default defineConfig({
 *     test: { include: ['src/**\/*.test.ts'] },
 *     mutate: { include: ['src/**\/*.ts', '!src/**\/*.test.ts'], thresholds: { break: 80 } },
 *   });
 *
 * Types only: the reference costs nothing at run time.
 */
import { type UserConfig } from 'vite';

import { type MutateConfig } from './config.js';

declare module 'vite' {
  interface UserConfig {
    /** oxmutate's settings: read by `oxmutate run` from this file when no oxmutate.config.* exists. */
    mutate?: MutateConfig;
  }
}

/** A Vite config with oxmutate's block: what `defineConfig` accepts once this module is imported. */
export type MutateViteConfig = UserConfig & { mutate?: MutateConfig };

export type { MutateConfig };
