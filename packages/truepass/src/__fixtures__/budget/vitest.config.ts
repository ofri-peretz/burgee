import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from 'vitest/config';

// Vite's and Vitest's caches go to the temporary directory, so an alone run leaves nothing in the tree.
const cache = join(tmpdir(), 'truepass-budget-fixture');
export default defineConfig({ cacheDir: cache, test: { include: ['**/*-fixture.ts'], root: import.meta.dirname, attachmentsDir: join(cache, 'attachments') } });
