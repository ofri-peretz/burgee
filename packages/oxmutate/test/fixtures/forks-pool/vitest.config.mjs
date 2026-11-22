import { defineConfig } from 'vitest/config';

// The project asks for forks: its tests call process.chdir, which a worker thread refuses.
export default defineConfig({ test: { include: ['src/**/*.spec.ts'], pool: 'forks' } });
