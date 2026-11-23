/* eslint-disable maintainability/consistent-function-scoping -- a test's helpers sit beside the case they serve */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ambientRuntime } from 'bellpull';
import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { bufFindings, diff } from './command-diff.js';
import { runLint } from './command-lint.js';
import { type BufBuild, type BufBreaking, breakingIn, bufIn, builtImages, isBufSource } from './input-buf.js';
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

/** Two annotations as buf breaking prints them, one line each, with a line of spaces between. */
const ANNOTATIONS = [
  '{"path":"pets/v1/pets.proto","start_line":12,"start_column":3,"end_line":12,"end_column":9,"type":"FIELD_SAME_TYPE","message":"Field \\"2\\" on message \\"Pet\\" changed type from \\"string\\" to \\"int64\\"."}',
  '  ',
  '{"type":"FILE_NO_DELETE","message":"Previously present file \\"old.proto\\" was deleted."}',
];

/**
 * A folder holding `buf` as npm installs a bin: `script` (node) behind a `#!` file on POSIX and a
 * `.cmd` shim on Windows.
 */
const binOf = (script: string): string => {
  const bin = makeDir('apicontract-buf-bin-');
  writeFileSync(join(bin, 'buf.mjs'), `${script}\n`);
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'buf.cmd'), '@echo off\r\nnode "%~dp0buf.mjs" %*\r\n');
  } else {
    writeFileSync(join(bin, 'buf'), `#!/usr/bin/env node\nimport './buf.mjs';\n`);
    chmodSync(join(bin, 'buf'), 0o755);
  }
  return bin;
};

/**
 * A fake `buf`: it writes its arguments to `args`. `build` fails on a file named `bad*` and prints
 * `<file>.image.json` for a `.proto` file or `<folder>/image.json` for a module; `breaking` fails on
 * `bad*`, finds nothing in `mod`, prints garbage for `garbage*`, and else prints the annotations
 * with buf's exit status 100.
 */
const fakeBuf = (): string =>
  binOf(
    [
      "import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';",
      "import { basename, dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      'const args = process.argv.slice(2);',
      "writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'args'), `${args.join(' ')}\\n`);",
      'const [command, target] = args;',
      'const name = basename(target);',
      "if (command === 'breaking') {",
      "  if (name.startsWith('bad')) { process.stderr.write('buf: cannot compare\\n'); process.exit(1); }",
      "  if (name === 'mod') process.exit(0);",
      "  if (name.startsWith('garbage')) { process.stdout.write('not json\\n'); process.exit(100); }",
      `  process.stdout.write(${JSON.stringify(ANNOTATIONS.map((line) => `${line}\n`).join(''))});`,
      '  process.exit(100);',
      '}',
      "if (name.startsWith('bad')) { process.stderr.write('bad.proto:3:1: syntax error\\n'); process.exit(1); }",
      "const image = existsSync(target) && statSync(target).isDirectory() ? join(target, 'image.json') : target.replace(/\\.proto$/, '.image.json');",
      'process.stdout.write(readFileSync(image));',
    ].join('\n'),
  );

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

/** The ambient runtime with this PATH. */
const runtimeOn = (path: string): ReturnType<typeof ambientRuntime> => ({
  ...ambientRuntime(),
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')), PATH: path },
});

/** `folder` in front of the PATH, on any platform. */
const before = (folder: string): string => `${folder}${delimiter}${process.env.PATH ?? ''}`;

/** The PATH with a fake buf in front. */
const withBuf = (): string => before(fakeBuf());

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

describe('breakingIn', () => {
  it('runs buf breaking with the level as its one category, and reads each annotation', async () => {
    const bin = fakeBuf();
    const dir = sources();
    const annotations = await breakingIn(runtimeOn(before(bin)))('new.proto', 'old.proto', 'wire-json', dir);
    expect(readFileSync(join(bin, 'args'), 'utf8')).toBe('breaking new.proto --against old.proto --error-format json --config {"version":"v2","breaking":{"use":["WIRE_JSON"]}}\n');
    expect(annotations).toStrictEqual([
      { path: 'pets/v1/pets.proto', line: 12, type: 'FIELD_SAME_TYPE', message: 'Field "2" on message "Pet" changed type from "string" to "int64".' },
      { path: '', line: 0, type: 'FILE_NO_DELETE', message: 'Previously present file "old.proto" was deleted.' },
    ]);
  });

  it.each([
    ['file', 'FILE'],
    ['package', 'PACKAGE'],
    ['wire', 'WIRE'],
  ] as const)('names --level %s as the category %s', async (level, category) => {
    const bin = fakeBuf();
    await breakingIn(runtimeOn(before(bin)))('new.proto', 'old.proto', level, sources());
    expect(readFileSync(join(bin, 'args'), 'utf8')).toContain(`"use":["${category}"]`);
  });

  it('finds nothing when buf exits clean', async () => {
    expect(await breakingIn(runtimeOn(withBuf()))('mod', 'old.proto', 'wire', sources())).toStrictEqual([]);
  });

  it('refuses, naming the install, when buf is not on the PATH', async () => {
    const judged = breakingIn(runtimeOn(makeDir('apicontract-buf-none-')))('new.proto', 'old.proto', 'wire', sources());
    await expect(judged).rejects.toThrow(UsageError);
    await expect(judged).rejects.toThrow('cannot judge new.proto at --level wire: buf is not on the PATH. fix: install buf (https://buf.build/docs/installation), or drop --level');
  });

  it('passes what buf reports through when it cannot compare', async () => {
    await expect(breakingIn(runtimeOn(withBuf()))('bad.proto', 'old.proto', 'wire', sources())).rejects.toThrow(
      'buf breaking could not compare bad.proto with old.proto: buf: cannot compare. fix: correct what buf reports, then run again',
    );
  });

  it('refuses a line that is not an annotation', async () => {
    const judged = breakingIn(runtimeOn(withBuf()))('garbage.proto', 'old.proto', 'wire', sources());
    await expect(judged).rejects.toThrow(UsageError);
    await expect(judged).rejects.toThrow('buf breaking printed what is not an annotation: not json. fix: run a buf that has --error-format json, then run again');
  });

  it('lets any other failure through as it is', async () => {
    const runtime = runtimeOn(withBuf());
    const judged = breakingIn({ ...runtime, env: { ...runtime.env, BROKEN: 'a\0b' } })('new.proto', 'old.proto', 'wire', sources());
    await expect(judged).rejects.toThrow();
    await expect(judged).rejects.not.toThrow(UsageError);
  });
});

describe('annotations that are not', () => {
  const printing = (line: string): string => before(binOf(`process.stdout.write(${JSON.stringify(`${line}\n`)});\nprocess.exit(100);`));

  it.each(['null', '{"type":"T"}', '{"message":"m"}', '{"type":1,"message":"m"}', '{"type":"T","message":2}'])('refuses %s', async (line) => {
    await expect(breakingIn(runtimeOn(printing(line)))('n', 'o', 'wire', '.')).rejects.toThrow(`not an annotation: ${line}.`);
  });

  it('reads a path or line of the wrong type as none', async () => {
    expect(await breakingIn(runtimeOn(printing('{"path":1,"start_line":"2","type":"T","message":"m"}')))('n', 'o', 'wire', '.')).toStrictEqual([{ path: '', line: 0, type: 'T', message: 'm' }]);
  });
});

describe('diff --level', () => {
  const judge: BufBreaking = async () => [{ path: 'pets/v1/pets.proto', line: 12, type: 'FIELD_SAME_TYPE', message: 'changed type' }];
  const built = (dir: string): ReadonlyMap<string, string> => new Map([[join(dir, 'old.proto'), IMAGE], [join(dir, 'mod'), IMAGE]]);

  it('counts what buf reports as breaking, beside the model\'s own findings', async () => {
    const dir = sources();
    const sides = { cwd: dir, old: join(dir, 'old.proto'), new: join(dir, 'mod'), built: built(dir) };
    const breaking = await bufFindings(sides, 'wire', judge);
    expect(breaking).toStrictEqual([
      {
        id: 'buf:FIELD_SAME_TYPE',
        scheme: 'buf',
        verdict: 'breaking',
        effect: 'narrows',
        operation: 'pets/v1/pets.proto',
        source: 'pets/v1/pets.proto:12',
        document: 'new',
        direction: 'request',
        pointer: '',
        before: undefined,
        after: undefined,
        fix: 'changed type (buf breaking at --level wire): restore what changed, or release it as a new major version',
      },
    ]);
    const data = diff({ ...sides, breaking });
    expect(data).toMatchObject({ verdict: 'breaking', summary: { breaking: 1, unknown: 0, dangerous: 0, 'non-breaking': 0 }, exitCode: ExitCode.RUNTIME });
    expect(diff(sides)).toMatchObject({ verdict: 'non-breaking', findings: [] });
  });

  it('runs buf breaking from the command, new against old', async () => {
    const bin = fakeBuf();
    vi.stubEnv('PATH', before(bin));
    const dir = sources();
    const r = await runBurgee(program, { argv: ['diff', join(dir, 'old.proto'), join(dir, 'new.proto'), '--level', 'wire', '--json'] });
    expect(readFileSync(join(bin, 'args'), 'utf8')).toContain(`breaking ${join(dir, 'new.proto')} --against ${join(dir, 'old.proto')}`);
    const { data } = r.json as { data: { findings: { id: string }[] } };
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(data.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining(['buf:FIELD_SAME_TYPE', 'buf:FILE_NO_DELETE']));
  });

  it('refuses releases, a side at a git ref, and a side that is not protobuf', async () => {
    const dir = sources();
    const pets = fileURLToPath(new URL('__fixtures__/diff/pets-old.yaml', import.meta.url));
    const base = { cwd: dir, old: join(dir, 'old.proto'), new: join(dir, 'mod'), built: built(dir) };
    await expect(bufFindings({ ...base, transitive: true }, 'wire', judge)).rejects.toThrow('--level compares two contracts. fix: drop --transitive, or run diff --level against each release');
    await expect(bufFindings({ ...base, old: 'git:v1:pets.json' }, 'wire', judge)).rejects.toThrow("cannot judge git:v1:pets.json at --level: buf reads a ref itself. fix: `buf build '.git#ref=<ref>' -o old.json` and pass old.json");
    await expect(bufFindings({ ...base, new: 'git:v1:pets.json' }, 'wire', judge)).rejects.toThrow('cannot judge git:v1:pets.json');
    await expect(bufFindings({ ...base, old: pets }, 'wire', judge)).rejects.toThrow(`--level judges the wire encoding, and ${pets} reads as openapi. fix: pass protobuf on both sides (a .proto, a buf module, or the image buf builds), or drop --level`);
    await expect(bufFindings({ ...base, new: pets }, 'wire', judge)).rejects.toThrow(`and ${pets} reads as openapi`);
    await expect(bufFindings({ ...base, transitive: false }, 'wire', judge)).resolves.toHaveLength(1);
  });
});
