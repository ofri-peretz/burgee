/** commander-env through the engine: provenance under --json, --explain, --version from the owning package.json (V3, V4). */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, execute, type RunOptions } from './index.js';

const dir = mkdtempSync(join(tmpdir(), 'burgee-env-'));
mkdirSync(join(dir, 'bin'), { recursive: true });
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app-pkg', version: '9.9.9', app: { region: 'pkg', verbose: true } }));
writeFileSync(join(dir, 'app.config.json'), JSON.stringify({ region: 'cfg' }));
const entry = join(dir, 'bin/cli.js');

const program = defineProgram({
  name: 'app',
  envPrefix: 'APP',
  config: true,
  commands: [
    defineCommand({
      name: 'deploy',
      options: { region: { type: 'string', default: 'us-1' }, verbose: { type: 'boolean' } },
      run: ({ options }) => ({ region: options['region'], verbose: options['verbose'] === true }),
    }),
    defineCommand({ name: 'other', options: { name: { type: 'string' } }, run: ({ options }) => options['name'] ?? 'none' }),
  ],
});

async function run(argv: string[], env: Record<string, string> = {}, extra: Partial<RunOptions> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  let code = -1;
  await execute(program, { argv, env, cwd: dir, entry, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, exit: (c) => { code = c; }, ...extra });
  return { code, stdout: out.join(''), stderr: err.join('') };
}
const json = (s: string): { ok: boolean; data: Record<string, unknown>; meta: { provenance: Record<string, { source: string; location?: string }> } } => JSON.parse(s) as never;

describe('precedence through the engine', () => {
  it('config beats the package.json field beats the default, and --json says so (V3)', async () => {
    const r = json((await run(['deploy', '--json'])).stdout);
    expect(r.data).toEqual({ region: 'cfg', verbose: true });
    expect(r.meta.provenance['region']).toMatchObject({ source: 'config' });
    expect(r.meta.provenance['verbose']).toMatchObject({ source: 'package' });
  });

  it('env beats config, a flag beats env', async () => {
    expect(json((await run(['deploy', '--json'], { APP_REGION: 'env' })).stdout).meta.provenance['region']).toEqual({ source: 'env', location: 'APP_REGION' });
    expect(json((await run(['deploy', '--json', '--region', 'flag'], { APP_REGION: 'env' })).stdout).data['region']).toBe('flag');
  });

  it('env never leaks into a command that does not declare the option (V1, yargs #873)', async () => {
    const r = await run(['other', '--json'], { APP_REGION: 'x', APP_NAME: 'named' });
    expect(json(r.stdout).data).toBe('named');
  });

  it('--no-config drops the file and the package.json field; --config names one; a missing one exits CONFIG (3)', async () => {
    expect(json((await run(['deploy', '--json', '--no-config'])).stdout).data).toEqual({ region: 'us-1', verbose: false });
    writeFileSync(join(dir, 'alt.json'), JSON.stringify({ region: 'alt' }));
    expect(json((await run(['deploy', '--json', '--config', 'alt.json'])).stdout).data['region']).toBe('alt');
    const missing = await run(['deploy', '--config', 'nope.json']);
    expect(missing.code).toBe(3);
    expect(missing.stderr).toMatch(/config file not found/);
  });

  it('a bad env boolean is CONFIG (3) with the fix, not a runtime failure', async () => {
    const r = await run(['deploy'], { APP_VERBOSE: 'maybe' });
    expect(r.code).toBe(3);
    expect(r.stderr).toMatch(/APP_VERBOSE=true or APP_VERBOSE=false/);
  });
});

describe('--explain and --version', () => {
  it('--explain <option> prints the winner and the candidates it beat, and runs nothing', async () => {
    const r = await run(['deploy', '--explain', 'region'], { APP_REGION: 'env' });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^region = "env"   from env APP_REGION\n/);
    expect(r.stdout).toContain('config file');
    expect(r.stdout).toContain('default "us-1"');
  });

  it('--version reads the package.json that owns the entry file (V4), unless the program declares one', async () => {
    expect((await run(['deploy', '--version'])).stdout).toBe('9.9.9\n');
    const declared = defineProgram({ name: 'v', version: '1.0.0', commands: [defineCommand({ name: 'x', run: () => 1 })] });
    const out: string[] = [];
    await execute(declared, { argv: ['x', '--version'], env: {}, entry, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined });
    expect(out.join('')).toBe('1.0.0\n');
  });

  it('reserves version and explain like the other surfaces (V5)', () => {
    expect(() => defineCommand({ name: 'x', options: { version: { type: 'boolean' } } })).toThrow(/reserved/);
    expect(() => defineCommand({ name: 'x', options: { explain: { type: 'string' } } })).toThrow(/reserved/);
  });
});
