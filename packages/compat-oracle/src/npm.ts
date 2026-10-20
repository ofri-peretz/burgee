/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * npm, run from the oracle: how to spawn it on every OS, and what the registry says a release's
 * publish time is (D-20261020-oracle-suite-deps-floated).
 *
 * One of the files that owns the process (`process-reference-lock.test.ts`): spawning npm needs
 * this Node's `execPath`, the platform and `npm_execpath`, as `run.ts` needs them to spawn suites.
 */
import { execFileSync } from 'node:child_process';

/** When `name@version` was published, as the registry's `time` field records it (ISO 8601). */
export type ReleaseTime = (name: string, version: string) => string;

/**
 * How to run npm here, without assuming a POSIX shell, as `scripts/family-install.ts` does. Under
 * `npm run` it is npm's own `npm-cli.js` through this Node. Otherwise it is `npm` on the PATH,
 * which on Windows is `npm.cmd`, a batch file only `cmd.exe` runs: so a shell there, for
 * arguments that are a literal and a package name from `hosts.ts`. Bare `npm` without one is
 * `spawnSync npm ENOENT` on Windows (#1180).
 */
export function npmCommand(args: readonly string[], platform: string = process.platform, cli: string | undefined = process.env['npm_execpath']): { file: string; args: string[]; shell: boolean } {
  if (cli?.endsWith('npm-cli.js') === true) return { file: process.execPath, args: [cli, ...args], shell: false };
  const windows = platform === 'win32';
  return { file: windows ? 'npm.cmd' : 'npm', args: [...args], shell: windows };
}

/** The registry's `time` for `name@version`; a release it does not list is an error, never a guess. */
export const registryTime: ReleaseTime = (name, version) => {
  const npm = npmCommand(['view', name, 'time', '--json']);
  const time = JSON.parse(execFileSync(npm.file, npm.args, { encoding: 'utf8', shell: npm.shell })) as Record<string, string | undefined>;
  const at = time[version];
  if (at === undefined) throw new Error(`the registry lists no publish time for ${name}@${version}`);
  return at;
};
