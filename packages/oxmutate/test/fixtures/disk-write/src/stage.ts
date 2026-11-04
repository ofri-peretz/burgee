import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Where a vendor step builds its copy before swapping it in, as compat-oracle's vendor.ts did before
 * #1453: emptied to `""`, every path joined to it lands in the working directory, the project.
 */
export const stagingOf = (live: string): string => `${live}.staging`;

/** Build into the staging directory, then clear it. */
export function stage(live: string): void {
  const staging = stagingOf(live);
  // Upstream's own directory name under the staging root, as vendor.ts copies a host's `test/`.
  const copy = path.join(staging, 'copy');
  mkdirSync(copy, { recursive: true });
  writeFileSync(path.join(copy, 'STRAY.md'), 'written by the vendor step\n');
  if (staging) rmSync(staging, { recursive: true, force: true });
}

/** A greeting no test pins down: every mutant of it survives, on a clean project. */
export const shout = (s: string): string => `${s.toUpperCase()}!`;
