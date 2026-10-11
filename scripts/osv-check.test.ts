/**
 * The offline half of `scripts/osv-check.ts`: what it sends OSV, how it names the path that
 * pulls a package in, and how it reads `osv-scanner.toml`. The network half is the script's
 * own run — `npm run check:osv`, and `.github/workflows/osv.yml`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { installed, type Lock, parseWaivers, pathTo, waived } from './osv-check.js';

const LOCK: Lock = {
  packages: {
    '': { name: 'cli', devDependencies: { lint: '^1.0.0' } },
    'apps/docs': { name: 'docs', version: '0.0.0', dependencies: { next: '^16.0.0' } },
    'node_modules/docs': { link: true, resolved: 'apps/docs' },
    'node_modules/next': { version: '16.3.8', optionalDependencies: { sharp: '^0.35.4' } },
    'node_modules/sharp': { version: '0.35.4' },
    'node_modules/lint': { version: '1.0.0', dependencies: { glob: '^4.0.0' } },
    'node_modules/glob': { version: '4.0.8', dependencies: { braces: '^3.0.3' } },
    'node_modules/glob/node_modules/braces': { version: '3.0.3' },
    'node_modules/braces': { version: '2.0.0' },
  },
};

describe('osv-check', () => {
  it('queries every registry package and no workspace, root or link', () => {
    expect(installed(LOCK).map((p) => `${p.name}@${p.version}`)).toEqual(['next@16.3.8', 'sharp@0.35.4', 'lint@1.0.0', 'glob@4.0.8', 'braces@3.0.3', 'braces@2.0.0']);
  });

  it('names the chain that pulls a package in, resolving nested copies the way node does', () => {
    expect(pathTo(LOCK, 'node_modules/sharp')).toEqual(['apps/docs', 'next', 'sharp']);
    // glob resolves its own nested braces@3, not the hoisted braces@2.
    expect(pathTo(LOCK, 'node_modules/glob/node_modules/braces')).toEqual(['<root>', 'lint', 'glob', 'braces']);
    // Nothing declares the hoisted copy, so no chain reaches it.
    expect(pathTo(LOCK, 'node_modules/braces')).toBeUndefined();
  });

  it('reads osv-scanner.toml waivers and lets them expire', () => {
    const waivers = parseWaivers(['# comment', '[[IgnoredVulns]]', 'id = "GHSA-x"', 'ignoreUntil = 2026-11-30', 'reason = "no fix released"'].join('\n'));
    expect(waivers).toEqual([{ id: 'GHSA-x', ignoreUntil: '2026-11-30', reason: 'no fix released' }]);
    expect(waived(waivers, 'GHSA-x', '2026-11-30')).toBeDefined();
    expect(waived(waivers, 'GHSA-x', '2026-12-01')).toBeUndefined();
    expect(waived(waivers, 'GHSA-y', '2026-01-01')).toBeUndefined();
  });

  it('refuses a waiver with no reason or expiry, and any line it does not understand', () => {
    expect(() => parseWaivers('[[IgnoredVulns]]\nid = "GHSA-x"\nreason = "r"')).toThrow(/needs id, ignoreUntil and reason/);
    expect(() => parseWaivers('[[IgnoredVulns]]\nid = "GHSA-x"\nignoreUntil = 2026-11-30')).toThrow(/needs id, ignoreUntil and reason/);
    expect(() => parseWaivers('[[PackageOverrides]]\nname = "braces"')).toThrow(/unsupported line/);
  });

  it('the committed waivers parse, each with a reason worth reading', () => {
    const file = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'osv-scanner.toml');
    for (const w of parseWaivers(readFileSync(file, 'utf8'))) expect(w.reason?.length).toBeGreaterThan(40);
  });
});
