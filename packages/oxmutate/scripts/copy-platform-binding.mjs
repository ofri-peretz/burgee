#!/usr/bin/env node
/**
 * copy-platform-binding.mjs — puts the cdylib cargo built for one platform package where npm packs it.
 *
 *   node scripts/copy-platform-binding.mjs <platform> [--target-dir DIR] [--out DIR]
 *
 * <platform> is a directory under npm/ (`darwin-arm64`, `linux-x64-musl`, …). The Rust target is
 * that package's `oxmutate.rustTarget`; the library is read from `<target-dir>/<rustTarget>/release/`
 * (`cargo build --target <rustTarget>`), and written to `npm/<platform>/oxmutate.node`, the package's
 * `main` (or to `--out DIR/oxmutate.node`). `--target-dir` defaults to `native/target`.
 *
 * A build without `--target` lands in `<target-dir>/release/`; that one is accepted only when the
 * platform package describes this very machine, so a host library never lands in another
 * platform's package. `binding/` (scripts/copy-binding.mjs) stays the development path.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = { darwin: 'liboxmutate_native.dylib', linux: 'liboxmutate_native.so', win32: 'oxmutate_native.dll' };

/** Whether this machine is the one the platform package describes (glibc vs musl read as src/native.ts reads it). */
function isHost(manifest) {
  if (manifest.os?.[0] !== process.platform || manifest.cpu?.[0] !== process.arch) return false;
  if (!manifest.libc) return true;
  const glibc = Boolean(process.report?.getReport()?.header?.glibcVersionRuntime);
  return manifest.libc[0] === (glibc ? 'glibc' : 'musl');
}

/** The built library for `manifest`: the `--target` build, else a host build when this is the host. */
function source(targetDir, manifest, lib) {
  const crossBuilt = path.join(targetDir, manifest.oxmutate.rustTarget, 'release', lib);
  if (existsSync(crossBuilt)) return { from: crossBuilt, tried: crossBuilt };
  const hostBuilt = path.join(targetDir, 'release', lib);
  if (!isHost(manifest)) return { tried: crossBuilt };
  return { from: existsSync(hostBuilt) ? hostBuilt : undefined, tried: `${crossBuilt} nor ${hostBuilt}` };
}

function main(args) {
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const platform = args[0];
  if (!platform || platform.startsWith('--')) {
    console.error('usage: copy-platform-binding.mjs <platform> [--target-dir DIR] [--out DIR]');
    return 2;
  }
  const manifestFile = path.join(pkgRoot, 'npm', platform, 'package.json');
  if (!existsSync(manifestFile)) {
    console.error(`copy-platform-binding: no platform package npm/${platform}`);
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const lib = LIBRARY[manifest.os?.[0]];
  if (!manifest.oxmutate?.rustTarget || !lib) {
    console.error(`copy-platform-binding: npm/${platform}/package.json names no oxmutate.rustTarget or a known os (${String(manifest.os?.[0])})`);
    return 1;
  }
  const targetDir = path.resolve(flag('--target-dir') ?? path.join(pkgRoot, 'native', 'target'));
  const { from, tried } = source(targetDir, manifest, lib);
  if (from === undefined) {
    console.error(`copy-platform-binding: no ${lib} at ${tried}. Build it: cargo build --release --features napi --lib --target ${manifest.oxmutate.rustTarget}`);
    return 1;
  }
  const outDir = path.resolve(flag('--out') ?? path.join(pkgRoot, 'npm', platform));
  mkdirSync(outDir, { recursive: true });
  const to = path.join(outDir, manifest.main ?? 'oxmutate.node');
  // Unlink first, never overwrite in place: macOS kills a process that has the old dylib mapped
  // when its file is rewritten (exit 9). A fresh inode leaves any loaded copy intact.
  rmSync(to, { force: true });
  copyFileSync(from, to);
  console.log(`${path.relative(process.cwd(), from)} → ${path.relative(process.cwd(), to)} (${statSync(to).size} bytes)`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
