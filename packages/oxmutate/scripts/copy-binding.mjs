// Copy the freshly built cdylib to binding/oxmutate.<platform>-<arch>.node (napi's naming).
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = { darwin: 'liboxmutate_native.dylib', linux: 'liboxmutate_native.so', win32: 'oxmutate_native.dll' }[process.platform];
const out = path.join(here, '..', 'binding');
mkdirSync(out, { recursive: true });
const target = path.join(out, `oxmutate.${process.platform}-${process.arch}.node`);
// A new file, not an overwrite: macOS kills a process that loads a code-signed dylib rewritten in
// place (exit 9, seen 2026-10-27), so a running e2e test or server never sees a half-copied core.
rmSync(target, { force: true });
copyFileSync(path.join(here, '..', 'native', 'target', 'release', lib), target);
console.log(path.relative(path.join(here, '..'), target));
