/**
 * V6 — the config file and the package.json field, as precedence layers, for a program that
 * opted into config discovery.
 *
 * Its own module since 2026-09-24 (U5): `execute.ts` imports it only when the manifest declares
 * `config`, so a program that never reads a config file carries none of this — as it already
 * carried none of `seniority/config`, which this reaches the same way.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { type Layers } from 'seniority/precedence';

import { type Package } from './pkg.js';

/** One path the discovery tried, why it was tried, and whether a file is there. */
export interface DiscoveryStep {
  path: string;
  reason: string;
  found: boolean;
}

/**
 * commander-env K3 — the discovery order, as data: every path in the order it is tried, and the
 * one read (the first that exists). `--config <path>` is the one path tried; `--no-config` tries
 * none. The order is seniority's own `candidates()`, the list `discover()` walks, so it cannot
 * disagree with what a run reads.
 */
export interface Discovery {
  order: DiscoveryStep[];
  read: string | null;
  /** `--no-config`: nothing is discovered, and the package.json field is off too. */
  off?: true;
}

interface DiscoveryIo {
  cwd: string;
  env: Record<string, string | undefined>;
}

/** The discovery order for `name` under these flags. Only `config explain` and `--explain` ask. */
export async function discoveryOf(name: string, values: Record<string, unknown>, io: DiscoveryIo): Promise<Discovery> {
  if (values['noConfig'] === true) return { order: [], read: null, off: true };
  const explicit = values['config'];
  const { candidates } = await import('seniority/config');
  const tried = typeof explicit === 'string' ? [{ path: resolve(io.cwd, explicit), reason: '--config' }] : candidates({ name, cwd: io.cwd, env: io.env });
  const order = tried.map((c) => ({ path: c.path, reason: c.reason, found: existsSync(c.path) }));
  return { order, read: order.find((step) => step.found)?.path ?? null };
}

/** The owning package.json's field named after the program, as a layer below config. */
function packageLayer(pkg: Package | undefined, name: string): Layers['pkg'] {
  if (pkg === undefined) return undefined;
  const field = pkg.data[name];
  return typeof field === 'object' && field !== null && !Array.isArray(field) ? { path: pkg.path, data: field as Record<string, unknown> } : undefined;
}

/** The config file and the package.json field, for a program that opted in; loaded lazily (K6). */
export async function configLayers(
  name: string,
  values: Record<string, unknown>,
  io: { cwd: string; env: Record<string, string | undefined>; pkg: Package | undefined; discovery?: Discovery },
): Promise<Pick<Layers, 'config' | 'pkg'>> {
  // `--explain` reports where in the discovery order a config value came from (K3). Only then is
  // the order walked a second time; a run that explains nothing pays nothing for it.
  if (values['explain'] !== undefined) io.discovery = await discoveryOf(name, values, io);
  const { discover } = await import('seniority/config');
  const explicit = values['config'];
  // Flags are canonical (camelCase) by now: `--no-config` reads as `noConfig`.
  const disabled = values['noConfig'] === true;
  const loaded = await discover({ name, cwd: io.cwd, env: io.env, ...(typeof explicit === 'string' ? { explicit } : {}), disabled });
  const out: Pick<Layers, 'config' | 'pkg'> = {};
  // The layer as seniority loaded it: each key cited at the file in the chain that set it, with
  // that file's line (seniority R3, R7). Joining the chain into one path cited every key at all
  // of them and at no line, so `--explain` could not say where a value was written.
  if (loaded !== undefined) out.config = loaded;
  // --no-config turns off every discovered source, the package.json field included.
  const pkg = disabled ? undefined : packageLayer(io.pkg, name);
  if (pkg !== undefined) out.pkg = pkg;
  return out;
}
