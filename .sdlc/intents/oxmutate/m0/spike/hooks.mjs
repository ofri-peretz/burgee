// Node module hooks for the M0 spike: TypeScript via esbuild, extensionless and `.js` → `.ts`
// resolution, and `vitest` → the spike's shim. Spike-only; the product will use oxc.
import { transformSync } from 'esbuild';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHIM = new URL('./vitest-shim.mjs', import.meta.url).href;
const isFile = (p) => existsSync(p) && statSync(p).isFile();

export async function resolve(specifier, context, next) {
  if (specifier === 'vitest') return { url: SHIM, shortCircuit: true };
  if ((specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    const candidates = [base, `${base}.ts`, base.replace(/\.js$/, '.ts'), path.join(base, 'index.ts')];
    for (const c of candidates) {
      if (c.endsWith('.ts') && isFile(c)) return { url: pathToFileURL(c).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

const transformed = new Map(); // file → code: a re-imported spec (`?r=n`) is transformed once

export async function load(url, context, next) {
  const { protocol, pathname } = new URL(url);
  if (protocol === 'file:' && pathname.endsWith('.ts')) {
    const file = fileURLToPath(`file://${pathname}`);
    let code = transformed.get(file);
    if (code === undefined) {
      ({ code } = transformSync(await readFile(file, 'utf8'), {
        loader: 'ts',
        format: 'esm',
        target: 'es2022',
        sourcefile: file,
      }));
      transformed.set(file, code);
    }
    return { format: 'module', source: code, shortCircuit: true };
  }
  return next(url, context);
}
