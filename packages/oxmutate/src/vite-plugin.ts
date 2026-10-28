/**
 * Serves instrumented sources to Vitest from memory, in place of the files on disk. No sandbox
 * copy: the project is run where it is, and only the mutated files' contents differ.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function instrumentedSources(mapPath: string): { name: string; enforce: 'pre'; load(id: string): string | undefined } {
  const map = new Map<string, string>(Object.entries(JSON.parse(readFileSync(mapPath, 'utf8')) as Record<string, string>).map(([k, v]) => [path.resolve(k), v]));
  return {
    name: 'oxmutate:instrumented-sources',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0] ?? id;
      return map.get(path.resolve(file));
    },
  };
}
