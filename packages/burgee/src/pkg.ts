/** The `package.json` that owns a file: the nearest one walking up from it (V4). */
import { dirname, join } from 'node:path';

import { builtin } from './runtime.js';

export interface Package {
  path: string;
  data: Record<string, unknown>;
}

export function nearestPackage(from: string): Package | undefined {
  const { existsSync, readFileSync } = builtin('node:fs');
  let dir = from;
  for (let i = 0; i < 64; i++) {
    const at = join(dir, 'package.json');
    if (existsSync(at)) {
      try {
        return { path: at, data: JSON.parse(readFileSync(at, 'utf8')) as Record<string, unknown> };
      } catch {
        return undefined;
      }
    }
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
  return undefined;
}

/**
 * The package.json that owns a file, found from where the file really is. npm puts a CLI's bin
 * in `node_modules/.bin` as a link, so `argv[1]` is the link and the nearest package.json above
 * it is the *installing* project's: `burgee --version` printed that project's version, and
 * under `npx` (no package.json above the cache's `.bin`) "no version declared". A path that
 * is not on disk (an injected entry in a test) is walked from as given.
 */
export function owningPackage(file: string): Package | undefined {
  const { existsSync, realpathSync } = builtin('node:fs');
  return nearestPackage(dirname(existsSync(file) ? realpathSync(file) : file));
}
