/* eslint-disable maintainability/consistent-function-scoping -- a test's helpers sit beside the case they serve */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { ambientRuntime } from 'bellpull';
import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { runLint } from './command-lint.js';
import { type BufBuild, bufIn, builtImages, isBufSource } from './input-buf.js';
import { UsageError } from './run-config.js';

import { program } from './index.js';

const IMAGE = readFileSync(new URL('__fixtures__/inputs/protobuf/pets.image.json', import.meta.url), 'utf8');

const makeDir = scratchDirs();

/** The fixture image with `Pet.display_name` turned from a string into an int64: a breaking change. */
const retyped = (): string => {
  const copy = JSON.parse(IMAGE) as { file: { messageType: { field: { name: string; type: string }[] }[] }[] };
  for (const each of copy.file[1]?.messageType[0]?.field ?? []) if (each.name === 'display_name') each.type = 'TYPE_INT64';
  return JSON.stringify(copy);
};

/**
 * A folder holding a fake `buf` written in node, run as npm runs a bin: a `#!` script on POSIX and a
 * `.cmd` shim on Windows. It writes its arguments to `args`, fails on a file named `bad*`, and
 * prints `<file>.image.json` for a `.proto` file or `<folder>/image.json` for a module.
 */
const fakeBuf = (): string => {
  const bin = makeDir('apicontract-buf-bin-');
  const script = [
    "import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';",
    "import { basename, dirname, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    'const args = process.argv.slice(2);',
    "writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'args'), `${args.join(' ')}\\n`);",
    'const target = args[1];',
    "if (basename(target).startsWith('bad')) { process.stderr.write('bad.proto:3:1: syntax error\\n'); process.exit(1); }",
    "const image = existsSync(target) && statSync(target).isDirectory() ? join(target, 'image.json') : target.replace(/\\.proto$/, '.image.json');",
    'process.stdout.write(readFileSync(image));',
  ].join('\n');
  writeFileSync(join(bin, 'buf.mjs'), `${script}\n`);
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'buf.cmd'), '@echo off\r\nnode "%~dp0buf.mjs" %*\r\n');
  } else {
    writeFileSync(join(bin, 'buf'), `#!/usr/bin/env node\nimport './buf.mjs';\n`);
    chmodSync(join(bin, 'buf'), 0o755);
  }
  return bin;
};

/** A folder of protobuf sources the fake buf builds: `old.proto`, `new.proto` (breaking), and a module `mod`. */
const sources = (): string => {
  const dir = makeDir('apicontract-buf-src-');
  for (const name of ['old', 'new', 'bad']) writeFileSync(join(dir, `${name}.proto`), 'syntax = "proto3";\n');
  writeFileSync(join(dir, 'old.image.json'), IMAGE);
  writeFileSync(join(dir, 'new.image.json'), retyped());
  mkdirSync(join(dir, 'mod'));
  writeFileSync(join(dir, 'mod', 'buf.yaml'), 'version: v2\n');
  writeFileSync(join(dir, 'mod', 'image.json'), IMAGE);
  return dir;
};

/** `folder` in front of the PATH, on any platform. */
const before = (folder: string): string => `${folder}${delimiter}${process.env.PATH ?? ''}`;

/** The PATH with a fake buf in front. */
const withBuf = (): string => before(fakeBuf());

/** The ambient runtime with this PATH, under the one key (Windows spells it `Path`, and a second spelling would be ambiguous). */
const runtimeOn = (path: string): ReturnType<typeof ambientRuntime> => ({
  ...ambientRuntime(),
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')), PATH: path },
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isBufSource', () => {
  it('is a .proto file, or a folder holding buf.yaml or buf.work.yaml', () => {
    const dir = sources();
    mkdirSync(join(dir, 'work'));
    writeFileSync(join(dir, 'work', 'buf.work.yaml'), 'version: v1\n');
    expect(isBufSource('old.proto', dir)).toBe(true);
    expect(isBufSource('mod', dir)).toBe(true);
    expect(isBufSource('work', dir)).toBe(true);
    expect(isBufSource('old.image.json', dir)).toBe(false);
    expect(isBufSource('.', dir)).toBe(false);
    expect(isBufSource('nowhere', dir)).toBe(false);
  });
});

describe('bufIn', () => {
  it('builds a source to the JSON image buf prints, in the folder given', async () => {
    const bin = fakeBuf();
    const dir = sources();
    expect(await bufIn(runtimeOn(before(bin)))('old.proto', dir)).toBe(IMAGE);
    expect(readFileSync(join(bin, 'args'), 'utf8')).toBe('build old.proto -o -#format=json\n');
  });

  it('refuses, naming the install, when buf is not on the PATH', async () => {
    const empty = makeDir('apicontract-buf-none-');
    const built = bufIn(runtimeOn(empty))('old.proto', sources());
    await expect(built).rejects.toThrow(UsageError);
    await expect(built).rejects.toThrow('cannot build old.proto: buf is not on the PATH. fix: install buf (https://buf.build/docs/installation), or hand over the image `buf build -o image.json` writes');
  });

  it('passes what buf reports through when it cannot build', async () => {
    await expect(bufIn(runtimeOn(withBuf()))('bad.proto', sources())).rejects.toThrow(
      'buf could not build bad.proto: bad.proto:3:1: syntax error. fix: correct what buf reports, then run again',
    );
  });

  it('lets any other failure through as it is', async () => {
    // An environment value holding a NUL byte: buf is found, and the system cannot start it.
    const runtime = runtimeOn(withBuf());
    const built = bufIn({ ...runtime, env: { ...runtime.env, BROKEN: 'a\0b' } })('old.proto', sources());
    await expect(built).rejects.toThrow();
    await expect(built).rejects.not.toThrow(UsageError);
  });
});

describe('builtImages', () => {
  const recording = (): BufBuild & { calls: string[] } => {
    const calls: string[] = [];
    return Object.assign(async (path: string, cwd: string) => {
      calls.push(`${path} in ${cwd}`);
      return `image of ${path}`;
    }, { calls });
  };

  it('builds only the protobuf sources, each once, and reads every other spec as it is', async () => {
    const dir = sources();
    const build = recording();
    const images = await builtImages(['old.proto', 'old.image.json', undefined, 'mod', 'git:main:a.yaml', 'repo-git:v1:x.proto'], dir, build);
    expect([...images]).toEqual([
      ['old.proto', 'image of old.proto'],
      ['mod', 'image of mod'],
      ['repo-git:v1:x.proto', 'image of repo-git:v1:x.proto'],
    ]);
    expect(build.calls).toEqual([`old.proto in ${dir}`, `mod in ${dir}`, `repo-git:v1:x.proto in ${dir}`]);
    expect(await builtImages(['a.yaml'], dir, build)).toEqual(new Map());
  });

  it('refuses a protobuf source at a git ref, naming the buf command that builds it', async () => {
    await expect(builtImages(['git:v1:mod'], sources(), recording())).rejects.toThrow('cannot build git:v1:mod: buf builds a ref itself');
    await expect(builtImages(['git:v1:pets.proto', 'pets.proto'], '.', recording())).rejects.toThrow(
      "cannot build git:v1:pets.proto: buf builds a ref itself. fix: `buf build '.git#ref=<ref>' -o old.json` and pass old.json",
    );
  });
});

describe('.proto inputs, end to end', () => {
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('diff builds both sides with buf and finds the breaking change', async () => {
    vi.stubEnv('PATH', withBuf());
    const dir = sources();
    const r = await runBurgee(program, { argv: ['diff', join(dir, 'old.proto'), join(dir, 'new.proto'), '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect((r.json as { data: { verdict: string } }).data.verdict).toBe('breaking');
  });

  it('diff --transitive builds every release given', async () => {
    vi.stubEnv('PATH', withBuf());
    const dir = sources();
    const r = await runBurgee(program, { argv: ['diff', join(dir, 'old.proto'), join(dir, 'mod'), join(dir, 'new.proto'), '--transitive', '--json'] });
    expect((r.json as { data: { verdict: string } }).data.verdict).toBe('breaking');
  });

  it('diff --transitive keeps a buf module as one release', async () => {
    vi.stubEnv('PATH', withBuf());
    const dir = sources();
    const r = await runBurgee(program, { argv: ['diff', join(dir, 'mod'), join(dir, 'old.proto'), '--transitive', '--json'] });
    expect(r.code).toBe(ExitCode.OK);
    expect((r.json as { data: { verdict: string } }).data.verdict).toBe('non-breaking');
  });

  it('props builds the contract and the one it is held against', async () => {
    vi.stubEnv('PATH', withBuf());
    const dir = sources();
    const r = await runBurgee(program, { argv: ['props', join(dir, 'old.proto'), '--against', join(dir, 'mod'), '--runs', '1', '--seed', '1', '--json'] });
    expect(r.stderr).not.toContain('buf');
    expect(r.code).toBe(ExitCode.OK);
  });

  it('props builds the contract alone when nothing is held against it', async () => {
    vi.stubEnv('PATH', withBuf());
    const r = await runBurgee(program, { argv: ['props', join(sources(), 'old.proto'), '--runs', '1', '--seed', '1', '--json'] });
    expect(r.code).toBe(ExitCode.OK);
  });

  it('lint reads the image buf builds', async () => {
    const dir = sources();
    const data = await runLint({ cwd: dir, specs: ['old.proto'], config: undefined, buf: async (path, cwd) => readFileSync(join(cwd, path.replace('.proto', '.image.json')), 'utf8') });
    expect(data.inputs).toEqual(['old.proto']);
  });

  it('lint finds buf on the PATH when no test gives its own', async () => {
    vi.stubEnv('PATH', withBuf());
    await expect(runLint({ cwd: sources(), specs: ['bad.proto'], config: undefined })).rejects.toThrow('buf could not build bad.proto');
  });
});
