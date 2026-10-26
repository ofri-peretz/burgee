export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.mjs' },
  mutate: ['src/array/**/*.ts', '!src/array/**/*.spec.ts', '!src/array/index.ts'],
  reporters: ['json', 'progress-append-only'],
  jsonReporter: { fileName: `reports/stryker-run${process.env.RUN ?? 1}.json` },
  concurrency: 4,
  coverageAnalysis: 'perTest',
  tempDirName: '.stryker-tmp',
  cleanTempDir: false,
  timeoutMS: 5000,
};
