/** The `package.json` that owns a file: the nearest one walking up from it (V4). */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface Package {
  path: string;
  data: Record<string, unknown>;
}

export function nearestPackage(from: string): Package | undefined {
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
