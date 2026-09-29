/**
 * The synthesised surfaces at their edges: `--version` with nothing to report, `completion`
 * with no shell, `help` on a program with no root node, `--mcp` relaying a tool's stderr, the
 * `__complete` callback given too little, `--json=` over a mixed list, and `--schema --field`
 * asked to walk into a value.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { completeDynamic } from './complete-dynamic.js';
import { defineCommand, defineProgram, execute, runCommand } from './execute.js';
import { ExitCode } from './exit-code.js';
import { Manifest } from './manifest.js';

const colours = async (partial: string): Promise<string[]> => ['red', 'green', 'grey'].filter((c) => c.startsWith(partial));
const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({ name: 'paint', effects: 'read_only', options: { colour: { type: 'string', complete: colours }, plain: { type: 'string' } }, run: () => ({ rows: 1 }) }),
    defineCommand({ name: 'list', effects: 'read_only', arguments: [{ name: 'filter', required: false }], run: ({ positionals }) => [{ a: 1, b: 2 }, 'loose', { a: positionals[0] ?? 3 }] }),
    defineCommand({ name: 'fail', effects: 'read_only', run: () => { throw new Error('it broke'); } }),
  ],
});

describe('--version with no version anywhere', () => {
  it('is a config error naming both places a version can come from', async () => {
    const r = await runCommand(program, ['--version'], { entry: '/' });
    expect(r).toEqual({ code: ExitCode.CONFIG, stdout: '', stderr: 'error: no version declared\nhint: pass version to defineProgram, or set "version" in the owning package.json\n' });
  });
});

describe('completion with no shell named', () => {
  it('is a usage error that lists the shells', async () => {
    const r = await runCommand(program, ['completion']);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toMatch(/^error: unknown shell ""\nhint: completion bash\|zsh\|fish\|pwsh\|fig\n$/);
  });
});

describe('help on a program with no root node', () => {
  it('prints the root’s help from its commands', async () => {
    const m = new Manifest();
    m.rootPath = ['bare'];
    m.add({ path: ['bare', 'sync'], description: 'Sync it', options: {}, effects: 'read_only', run: () => undefined });
    const r = await runCommand(m, ['help']);
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toMatch(/sync +Sync it/);
  });
});

describe('--mcp keeps a tool call’s stderr apart from its result', () => {
  it('returns the envelope alone, and the deprecation warning the run wrote stays off both', async () => {
    const withOld = defineProgram({ name: 'app', commands: [defineCommand({ name: 'old', effects: 'read_only', deprecated: 'new', run: () => 'still works' })] });
    const input = new PassThrough();
    const out: string[] = [];
    const err: string[] = [];
    input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'old', arguments: {} } })}\n`);
    await execute(withOld, { argv: ['--mcp'], stdin: input, stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: () => undefined });
    const reply = JSON.parse(out.join('').trim()) as { result: { content: { text: string }[]; isError: boolean } };
    expect(reply.result).toEqual({ content: [{ type: 'text', text: '{"ok":true,"data":"still works","meta":{"provenance":{}}}' }], isError: false });
    expect(err).toEqual([]);
  });
});

const offered = async (argv: string[], manifest: Manifest = program): Promise<string> => {
  const out: string[] = [];
  await completeDynamic(manifest, argv, (s) => out.push(s));
  return out.join('');
};

describe('the __complete callback given too little', () => {  it('offers everything when the value is not typed yet', async () => {
    expect(await offered(['paint', '--colour'])).toBe('red\ngreen\ngrey\n');
    expect(await offered(['paint', '--colour', 'gr'])).toBe('green\ngrey\n');
  });
  it('offers nothing with no flag at all, for a flag with no completer, or on a program with no such command', async () => {
    expect(await offered(['paint'])).toBe('');
    expect(await offered(['paint', '--plain', 'x'])).toBe('');
    const m = new Manifest();
    m.rootPath = ['bare'];
    expect(await offered(['nope', '--colour'], m)).toBe('');
  });
});

describe('--json=<fields> over a list with a non-object in it', () => {
  it('selects from each object and passes anything else through, with a positional beside it', async () => {
    const r = await runCommand(program, ['list', 'x', '--json=a']);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, data: [{ a: 1 }, 'loose', { a: 'x' }] });
  });
  it('names every unknown field, in the plural', async () => {
    const r = await runCommand(program, ['list', '--json=a,x,y']);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { message: 'unknown fields "x", "y"', hint: 'valid fields: a, b' } });
  });
});

describe('--schema --field walking into a value', () => {
  it('says the value has no fields', async () => {
    const r = await runCommand(program, ['--schema', 'paint', '--field', 'name.x']);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toBe('error: "name" has no field "x"\nhint: fields here: none — it is a value\n');
  });
  it('reads nothing after --', async () => {
    const r = await runCommand(program, ['--schema', 'paint', '--', '--field', 'effects']);
    expect(r.code).toBe(ExitCode.OK);
    expect(JSON.parse(r.stdout)).toMatchObject({ name: 'paint', effects: 'read_only' });
  });
});
