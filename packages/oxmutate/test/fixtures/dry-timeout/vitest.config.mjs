import { defineConfig } from 'vitest/config';

// Small on purpose: the test below takes longer than these only in oxmutate's dry run.
export default defineConfig({ test: { include: ['src/**/*.spec.ts'], testTimeout: 200, hookTimeout: 200 } });
