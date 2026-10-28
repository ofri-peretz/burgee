/// <reference types="vitest/config" />
/// <reference types="oxmutate/vite" />
import { defineConfig } from 'vite';

// One file for the whole toolchain, the Vite+ way: Vitest's block and oxmutate's side by side.
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'] },
  mutate: {
    include: ['src/registry.ts'],
    concurrency: 1,
    flakyReruns: 0,
    thresholds: { break: 50 },
    reporters: ['json'],
  },
});
