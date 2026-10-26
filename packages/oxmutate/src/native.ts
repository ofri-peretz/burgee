/**
 * The native core (`native/`, Rust on oxc), loaded for this platform. It ships as one prebuilt
 * `.node` per platform (PRINCIPLES rule 9, `native-engine`): `binding/oxmutate.<platform>-<arch>.node`
 * in development, the matching `@oxmutate/binding-*` optional dependency once published.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const target = `${process.platform}-${process.arch}`;

let binding: Binding | undefined;

export function native(): Binding {
  if (binding) return binding;
  const candidates = [
    path.join(here, '..', 'binding', `oxmutate.${target}.node`),
    path.join(here, '..', '..', 'binding', `oxmutate.${target}.node`),
  ];
  const local = candidates.find((c) => existsSync(c));
  try {
    binding = (local ? require(local) : require(`@oxmutate/binding-${target}`)) as Binding;
  } catch (error) {
    throw new Error(
      `oxmutate: no native core for ${target}. fix: install the platform package (npm i @oxmutate/binding-${target}) or build it (npm run build:native in packages/oxmutate)`,
      { cause: error },
    );
  }
  return binding;
}
