import { readFileSync } from 'node:fs';

// Read at import: a mutant here makes the test file fail to load, which is a kill.
export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
