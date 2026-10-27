/**
 * The native core (`native/`, Rust on oxc), loaded for this platform. It ships as one prebuilt
 * `.node` per platform (PRINCIPLES rule 9, `native-engine`): `binding/oxmutate.<platform>-<arch>.node`
 * in development, the matching `@oxmutate/binding-*` optional dependency once published.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
}
export interface InstrumentedFile {
  path: string;
  code?: string;
  mutants: NativeMutant[];
  error?: string;
}
interface Binding {
  instrumentFiles(files: { path: string; source: string }[], options?: { strykerCompat?: boolean }): InstrumentedFile[];
  nativeVersion(): string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const target = `${process.platform}-${process.arch}`;

/** The platform package for this machine: `oxmutate-<platform>-<arch>[-gnu|-musl|-msvc]`. */
function platformPackage(): string {
  if (process.platform === 'win32') return `oxmutate-win32-${process.arch}-msvc`;
  if (process.platform === 'linux') {
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
    return `oxmutate-linux-${process.arch}-${report?.header?.glibcVersionRuntime ? 'gnu' : 'musl'}`;
  }
  return `oxmutate-${target}`;
}

let binding: Binding | undefined;

export function native(): Binding {
  if (binding) return binding;
  const candidates = [
    path.join(here, '..', 'binding', `oxmutate.${target}.node`),
    path.join(here, '..', '..', 'binding', `oxmutate.${target}.node`),
  ];
  try {
    // `process.dlopen` loads a native addon straight from its path, the way `require` does it
    // underneath; the published core is the platform package's `main`, `oxmutate.node`.
    const file = candidates.find((c) => existsSync(c)) ?? fileURLToPath(import.meta.resolve(platformPackage()));
    const addon = { exports: {} };
    process.dlopen(addon, file);
    binding = addon.exports as Binding;
  } catch (error) {
    throw new Error(
      `oxmutate: no native core for ${target}. fix: install the platform package (npm i ${platformPackage()}) or build it (npm run build:native in packages/oxmutate)`,
      { cause: error },
    );
  }
  return binding;
}
