/** `oxmutate/vite`: the `mutate` block on Vite's config type, so `vite.config.ts` holds it beside `test` (`/// <reference types="oxmutate/vite" />`). */
import type { UserConfig } from 'vite';

import type { MutateConfig } from './config.js';

declare module 'vite' {
  interface UserConfig {
    /** oxmutate's settings: read by `oxmutate run` from this file when no oxmutate.config.* exists. */
    mutate?: MutateConfig;
  }
}

/** A Vite config with oxmutate's block: what `defineConfig` accepts once this module is referenced. */
export type MutateViteConfig = UserConfig & { mutate?: MutateConfig };

export type { MutateConfig };

/** Types a `mutate` block written apart from `defineConfig` (in a shared file, say); returns it unchanged. */
export const defineMutate = (config: MutateConfig): MutateConfig => config;
