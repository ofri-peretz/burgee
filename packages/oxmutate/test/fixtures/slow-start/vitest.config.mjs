import { defineConfig } from 'vitest/config';

// Loading this config takes 4 s, as loading Vitest does on a machine at load 30: each server is
// still inside `createVitest` when its coordinator dies (e2e.test.ts, T6 at start-up).
const START_DELAY_MS = 4000;
await new Promise((resolve) => setTimeout(resolve, START_DELAY_MS));

export default defineConfig({ test: { include: ['src/**/*.spec.ts'] } });
