// Copy the freshly built cdylib to binding/oxmutate.<platform>-<arch>.node (napi's naming).
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = { darwin: 'liboxmutate_native.dylib', linux: 'liboxmutate_native.so', win32: 'oxmutate_native.dll' }[process.platform];
const out = path.join(here, '..', 'binding');
mkdirSync(out, { recursive: true });
copyFileSync(path.join(here, '..', 'native', 'target', 'release', lib), path.join(out, `oxmutate.${process.platform}-${process.arch}.node`));
console.log(`binding/oxmutate.${process.platform}-${process.arch}.node`);
