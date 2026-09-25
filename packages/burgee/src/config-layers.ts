/**
 * V6 — the config file and the package.json field, as precedence layers, for a program that
 * opted into config discovery.
 *
 * Its own module since 2026-09-24 (U5): `execute.ts` imports it only when the manifest declares
 * `config`, so a program that never reads a config file carries none of this — as it already
 * carried none of `seniority/config`, which this reaches the same way.
 */
import { type Layers } from 'seniority/precedence';

import { type Package } from './pkg.js';

/** The owning package.json's field named after the program, as a layer below config. */
function packageLayer(pkg: Package | undefined, name: string | undefined): Layers['pkg'] {
  if (pkg === undefined || name === undefined) return undefined;
  const field = pkg.data[name];
  return typeof field === 'object' && field !== null && !Array.isArray(field) ? { path: pkg.path, data: field as Record<string, unknown> } : undefined;
}

/** The config file and the package.json field, for a program that opted in; loaded lazily (K6). */
export async function configLayers(
  name: string,
  values: Record<string, unknown>,
  io: { cwd: string; env: Record<string, string | undefined>; pkg: Package | undefined },
): Promise<Pick<Layers, 'config' | 'pkg'>> {
  const { discover } = await import('seniority/config');
  const explicit = values['config'];
  // Flags are canonical (camelCase) by now: `--no-config` reads as `noConfig`.
  const disabled = values['noConfig'] === true;
  const loaded = await discover({ name, cwd: io.cwd, env: io.env, ...(typeof explicit === 'string' ? { explicit } : {}), disabled });
  const out: Pick<Layers, 'config' | 'pkg'> = {};
  if (loaded !== undefined) out.config = { path: loaded.chain.join(' ← '), data: loaded.data };
  // --no-config turns off every discovered source, the package.json field included.
  const pkg = disabled ? undefined : packageLayer(io.pkg, name);
  if (pkg !== undefined) out.pkg = pkg;
  return out;
}
