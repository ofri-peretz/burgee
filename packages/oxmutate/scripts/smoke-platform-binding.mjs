#!/usr/bin/env node
/**
 * smoke-platform-binding.mjs — is `npm/<platform>/oxmutate.node` the core for that platform, and does it load?
 *
 *   node scripts/smoke-platform-binding.mjs <platform> [--file F] [--require-load]
 *
 * Always: the file's object format and machine (Mach-O / ELF / PE header) match the package's
 * `os` and `cpu`, so a library built for the wrong target cannot be packed under this name.
 * When this machine is that platform (glibc vs musl included): `process.dlopen` it — how
 * src/native.ts loads it — and call `nativeVersion()` and check `instrumentFiles` is there.
 * Otherwise it says why it did not load; `--require-load` turns that into a failure.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Header fields, from <mach-o/loader.h>, the ELF spec and the PE/COFF spec.
const MIN_HEADER = 64;
const HEX = 16;
const MACHO_64 = { magic: 0xfeedfacf, cpuAt: 4, cpu: { 0x01000007: 'x64', 0x0100000c: 'arm64' } };
const ELF = { magic: 0x7f454c46, machineAt: 18, machine: { 62: 'x64', 183: 'arm64' } };
const PE = { lfanewAt: 0x3c, machineAfterSignature: 4, machine: { 0x8664: 'x64', 0xaa64: 'arm64' } };

/** `{ format, cpu }` from the header: Mach-O 64, ELF 64 or PE32+. */
function header(bytes) {
  if (bytes.length < MIN_HEADER) return { format: 'too short', cpu: '?' };
  if (bytes.readUInt32LE(0) === MACHO_64.magic) {
    const type = bytes.readUInt32LE(MACHO_64.cpuAt);
    return { format: 'darwin', cpu: MACHO_64.cpu[type] ?? `cputype 0x${type.toString(HEX)}` };
  }
  if (bytes.readUInt32BE(0) === ELF.magic) {
    const machine = bytes.readUInt16LE(ELF.machineAt);
    return { format: 'linux', cpu: ELF.machine[machine] ?? `e_machine ${machine}` };
  }
  if (bytes.toString('latin1', 0, 2) === 'MZ') {
    const machine = bytes.readUInt16LE(bytes.readUInt32LE(PE.lfanewAt) + PE.machineAfterSignature);
    return { format: 'win32', cpu: PE.machine[machine] ?? `machine 0x${machine.toString(HEX)}` };
  }
  return { format: 'unknown', cpu: '?' };
}

/** Why this machine cannot load the package's core, or `undefined` when it can. */
function cannotLoad(manifest) {
  if (process.platform !== manifest.os?.[0] || process.arch !== manifest.cpu?.[0]) return `this machine is ${process.platform}/${process.arch}`;
  if (!manifest.libc) return undefined;
  const glibc = Boolean(process.report?.getReport()?.header?.glibcVersionRuntime);
  const hostLibc = glibc ? 'glibc' : 'musl';
  return manifest.libc[0] === hostLibc ? undefined : `this machine's libc is ${hostLibc}, the package's is ${manifest.libc[0]}`;
}

function main(args) {
  const platform = args[0];
  if (!platform || platform.startsWith('--')) {
    console.error('usage: smoke-platform-binding.mjs <platform> [--file F] [--require-load]');
    return 2;
  }
  const manifest = JSON.parse(readFileSync(path.join(pkgRoot, 'npm', platform, 'package.json'), 'utf8'));
  const at = args.indexOf('--file');
  const file = path.resolve(at === -1 ? path.join(pkgRoot, 'npm', platform, manifest.main ?? 'oxmutate.node') : (args[at + 1] ?? ''));
  const fail = (message) => {
    console.error(`::error::${manifest.name}: ${message}`);
    return 1;
  };

  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    return fail(`no ${path.relative(process.cwd(), file)} — the native build did not produce it`);
  }
  const got = header(bytes);
  const want = { format: manifest.os?.[0], cpu: manifest.cpu?.[0] };
  if (got.format !== want.format || got.cpu !== want.cpu) return fail(`${path.basename(file)} is ${got.format}/${got.cpu}, but the package is for ${want.format}/${want.cpu}`);
  console.log(`${manifest.name}: ${got.format}/${got.cpu} binary, ${bytes.length} bytes`);

  const why = cannotLoad(manifest);
  if (why !== undefined) {
    if (args.includes('--require-load')) return fail(`cannot load here: ${why}`);
    console.log(`not loaded: ${why} (header checked only)`);
    return 0;
  }
  return load(manifest.name, file, fail);
}

/** `process.dlopen` the core, as src/native.ts does, and call into it. */
function load(name, file, fail) {
  const addon = { exports: {} };
  try {
    process.dlopen(addon, file);
  } catch (error) {
    return fail(`process.dlopen failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof addon.exports.nativeVersion !== 'function') return fail('loaded, but exports no nativeVersion()');
  if (typeof addon.exports.instrumentFiles !== 'function') return fail('loaded, but exports no instrumentFiles()');
  console.log(`${name}: loaded with process.dlopen on node ${process.version}; nativeVersion() = ${addon.exports.nativeVersion()}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
