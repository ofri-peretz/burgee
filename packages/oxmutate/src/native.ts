/**
 * The native core (`native/`, Rust on oxc), loaded for this platform. It ships as one prebuilt
 * `.node` per platform (PRINCIPLES rule 9, `native-engine`): 0.1 bundles all six in the tarball as
 * `binding/oxmutate.<tag>.node` (`platform.ts` names the tag); development builds
 * `binding/oxmutate.<platform>-<arch>.node`; the `oxmutate-<tag>` platform package comes last.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bindingNames, type Machine, platformPackage } from './platform.js';

export interface Location {
  line: number;
  column: number;
}
export interface NativeMutant {
  id: string;
  mutatorName: string;
  replacement: string;
  start: Location;
  end: Location;
  /** Set when an ignore rule covers the mutant: reported as Ignored, never placed in the code. */
  ignoredReason?: string;
}
export interface InstrumentedFile {
  path: string;
  code?: string;
  mutants: NativeMutant[];
  error?: string;
}
/** A call whose subtree is not mutated (Stryker's ignorers, as data): `console.*`, `**.debug`. */
export interface IgnoreRule {
  call: string;
  reason?: string | undefined;
}

interface Binding {
  instrumentFiles(files: { path: string; source: string }[], options?: { strykerCompat?: boolean; ignore?: IgnoreRule[] }): InstrumentedFile[];
  nativeVersion(): string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const target = `${process.platform}-${process.arch}`;

/** This machine, as `platform.ts` reads it: glibc's runtime version from `process.report` (absent on musl). */
function machine(): Machine {
  const glibc = process.platform === 'linux' ? (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header?.glibcVersionRuntime : undefined;
  return { platform: process.platform, arch: process.arch, glibc };
}

let binding: Binding | undefined;

export function native(): Binding {
  if (binding) return binding;
  const self = machine();
  // `binding/` beside `dist/` (published) or `src/` (development), then one level up.
  const candidates = [path.join(here, '..', 'binding'), path.join(here, '..', '..', 'binding')].flatMap((dir) => bindingNames(self).map((name) => path.join(dir, name)));
  try {
    // `process.dlopen` loads a native addon straight from its path, the way `require` does it
    // underneath. Since 0.1 the six release cores ship inside the tarball as
    // `binding/oxmutate.<tag>.node`; the platform package (its `main`, `oxmutate.node`) is last,
    // for when those publish.
    const file = candidates.find((c) => existsSync(c)) ?? fileURLToPath(import.meta.resolve(platformPackage(self)));
    const addon = { exports: {} };
    process.dlopen(addon, file);
    binding = addon.exports as Binding;
  } catch (error) {
    throw new Error(
      `oxmutate: no native core for ${target}. fix: install the platform package (npm i ${platformPackage(machine())}) or build it (npm run build:native in packages/oxmutate)`,
      { cause: error },
    );
  }
  return binding;
}
