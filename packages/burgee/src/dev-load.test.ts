/**
 * `burgee dev` loads what the entry exports, and dev.test.ts only ever gave it a burgee
 * manifest. These are the other three shapes it promises to serve — a manifest from another
 * copy of burgee, a yargs instance and a commander `Command` — plus the one it refuses, each
 * loaded and then *called*, since a program recognised under the wrong kind is invoked through
 * the wrong door and answers nothing.
 *
 * And the reload report's two quieter lines: a removed command, and a program with no root node.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { dev, load, report } from './dev.js';
import { defineCommand, defineProgram } from './execute.js';
import { Manifest } from './manifest.js';

const src = dirname(fileURLToPath(import.meta.url));
const spec = (file: string): string => JSON.stringify(resolve(src, file));
const dir = mkdtempSync(join(tmpdir(), 'burgee-dev-load-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
const entry = (source: string): string => {
  n += 1;
  const file = join(dir, `cli-${String(n)}.ts`);
  writeFileSync(file, source);
  return file;
};

describe('load() serves every program shape it names', () => {
  it('a manifest built by another copy of burgee, recognised by its shape rather than its class', async () => {
    // A Proxy whose prototype is Object's: `instanceof Manifest` is false, exactly as it is for
    // a manifest from a second install of burgee, while every member still answers.
    const file = entry(`import { defineCommand, defineProgram } from ${spec('index.ts')};
const real = defineProgram({ name: 'copy', commands: [defineCommand({ name: 'ping', effects: 'read_only', run: () => 'pong from a copy' })] });
export const program = new Proxy(real, { getPrototypeOf: () => Object.prototype });
`);
    const loaded = await load(file, 1);
    expect(loaded.kind).toBe('burgee');
    expect(loaded.manifest instanceof Manifest).toBe(false);
    expect(await loaded.invoke(['ping'])).toEqual({ stdout: 'pong from a copy\n', stderr: '', code: 0 });
  });

  it('a yargs instance, invoked through its own seam', async () => {
    const file = entry(`import yargs from ${spec('yargs.ts')};
export default yargs([]).scriptName('yy').command('hi <who>', 'Say hi', (y) => y.effects('read_only'), (argv) => 'hi ' + argv.who);
`);
    const loaded = await load(file, 1);
    expect(loaded.kind).toBe('yargs');
    expect(loaded.manifest.find(['yy', 'hi'])?.description).toBe('Say hi');
    expect(await loaded.invoke(['hi', 'there'])).toEqual({ stdout: 'hi there\n', stderr: '', code: 0 });
  });

  it('a commander Command, invoked with argv from the user', async () => {
    const file = entry(`import { Command } from ${spec('commander.ts')};
export const program = new Command('cc').version('4.5.6');
program.command('add').argument('<a>').argument('<b>').effects('read_only').action(() => undefined);
`);
    const loaded = await load(file, 1);
    expect(loaded.kind).toBe('commander');
    expect(loaded.manifest.find(['cc', 'add'])).toBeDefined();
    // argv is the user's: were it read `from: 'node'`, '--version' would be taken for the script.
    expect(await loaded.invoke(['--version'])).toEqual({ stdout: '4.5.6\n', stderr: '', code: 0 });
    const bad = await loaded.invoke(['nope']);
    expect(bad.code).not.toBe(0);
    expect(bad.stderr).toMatch(/unknown command 'nope'/);
  });

  it('refuses a module that exports no program, naming both places it looked', async () => {
    const file = entry('export const program = 42;\nexport default null;\n');
    await expect(load(file, 1)).rejects.toThrow(`${file} exports no program: export a burgee manifest, a commander Command or a yargs instance as \`program\` or default`);
  });

  it('refuses a module that exports nothing at all, null, or an array', async () => {
    await expect(load(entry('export const unrelated = 1;\n'), 1)).rejects.toThrow(/exports no program/);
    await expect(load(entry('export default null;\n'), 1)).rejects.toThrow(/exports no program/);
    await expect(load(entry('export default [];\n'), 1)).rejects.toThrow(/exports no program/);
  });
});

const loaded = (manifest: Manifest): Parameters<typeof report>[1] => ({ manifest, kind: 'burgee', ms: 1, invoke: async () => ({ stdout: '', stderr: '', code: 0 }) });

describe('the reload report (W3)', () => {
  const ping = defineCommand({ name: 'ping', description: 'Reply', effects: 'read_only', run: () => 'pong' });
  const pong = defineCommand({ name: 'pong', description: 'Reply back', effects: 'read_only', run: () => 'ping' });

  it('names a removed command with a minus', () => {
    const text = report(defineProgram({ name: 'app', commands: [ping, pong] }), loaded(defineProgram({ name: 'app', commands: [ping] })));
    expect(text.split('\n').slice(0, 2)).toEqual(['reloaded app (burgee) in 1 ms — 2 commands, 1 MCP tools', '  - app pong']);
  });

  it('prints no help for a program with no root node, rather than a blank one', () => {
    const m = new Manifest();
    m.rootPath = ['bare'];
    m.add({ path: ['bare', 'x'], options: {}, effects: 'read_only', run: () => undefined });
    expect(report(undefined, loaded(m))).toBe('loaded bare (burgee) in 1 ms — 1 commands, 1 MCP tools\n  + bare x\n');
  });
});

describe('a reload that throws something other than an Error', () => {
  it('reports it in its own words, and the handle rejects with it', async () => {
    const file = entry("throw 'the entry is half-written';\n");
    const logged: string[] = [];
    const input = new PassThrough();
    const handle = dev({ entry: file, input, output: new PassThrough(), log: { write: (s) => logged.push(s) }, watch: false });
    await expect(handle.ready).rejects.toBe('the entry is half-written');
    await expect(handle.done).rejects.toBe('the entry is half-written');
    // `reload()` reports through the chain's catch, which settles after `ready` does.
    await handle.reload().catch(() => undefined);
    expect(logged[0]).toBe('reload failed: the entry is half-written\n');
    handle.close();
  });
});
