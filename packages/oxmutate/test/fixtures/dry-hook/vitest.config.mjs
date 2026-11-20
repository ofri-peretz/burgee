import { defineConfig } from "vitest/config";

// Small on purpose: a hook below takes longer than the hook timeout only in oxmutate's dry run.
export default defineConfig({
  test: { include: ["src/**/*.spec.ts"], testTimeout: 200, hookTimeout: 200 },
});
