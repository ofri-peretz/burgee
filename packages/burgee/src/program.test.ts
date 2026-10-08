/**
 * `burgee` — the package's own command line, run in-process.
 *
 * `scripts/bin-help-lock.test.ts` and `plugin-check-lock.test.ts` drive the built binary in a
 * child process, which is the contract a user meets and which no v8 counter here can see. This
 * file is the other half: each command's handler, through the same `execute` the binary uses,
 * so a flag that stopped reaching its handler fails here with the flag's name on it.
 *
 * `dev` never returns — it serves MCP on the process's stdio until stdin closes — so its module
 * is replaced, and what is asserted is what the command hands it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCommand } from './execute.js';
import { ExitCode } from './exit-code.js';
import { program } from './program.js';
import { processRuntime } from './runtime.js';

const dev = vi.hoisted(() => vi.fn((_opts: Record<string, unknown>) => ({ done: Promise.resolve() })));
vi.mock('./dev.js', () => ({ dev }));

/** Two colours whose bars clear 3:1 against the derived field. */
const PASSING = ['--lead', '#f5a623', '--follow', '#4ecdc4'];

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'burgee-program-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  dev.mockClear();
});

const json = async (argv: string[]): Promise<{ code: number; data: Record<string, unknown>; stderr: string }> => {
  const r = await runCommand(program, [...argv, '--json']);
  const envelope = JSON.parse(r.stdout === '' ? '{}' : r.stdout) as { data?: Record<string, unknown> };
  return { code: r.code, data: envelope.data ?? {}, stderr: r.stderr };
};

describe('burgee brand', () => {
  it('prints the flag and writes nothing when --out is not given', async () => {
    const r = await json(['brand', ...PASSING]);
    expect(r.code).toBe(ExitCode.OK);
    expect(r.data['files']).toEqual([]);
    expect(String(r.data['flag'])).toMatch(/^<svg[^>]*width="512"/);
    expect(r.data['contrast']).toEqual(expect.arrayContaining([expect.objectContaining({ passes: true })]));
  });

  it('writes all six surfaces into --out, each ending in a newline', async () => {
    const out = join(dir, 'brand');
    const r = await json(['brand', ...PASSING, '--out', out]);
    expect(r.data['files']).toEqual(['flag.svg', 'icon.svg', 'og.svg', 'cover.svg', 'lockup.svg', 'lockup-light.svg']);
    expect(r.data['out']).toBe(out);
    expect(readdirSync(out).sort()).toEqual(['cover.svg', 'flag.svg', 'icon.svg', 'lockup-light.svg', 'lockup.svg', 'og.svg']);
    expect(readFileSync(join(out, 'flag.svg'), 'utf8')).toMatch(/<\/svg>\n$/);
  });

  it('carries --name into the label, --tagline onto the card and cover, and not onto the flag', async () => {
    const out = join(dir, 'named');
    await json(['brand', ...PASSING, '--name', 'Acme', '--tagline', 'rockets since 1949', '--out', out]);
    expect(readFileSync(join(out, 'flag.svg'), 'utf8')).toContain('Acme');
    expect(readFileSync(join(out, 'og.svg'), 'utf8')).toContain('rockets since 1949');
    expect(readFileSync(join(out, 'cover.svg'), 'utf8')).toContain('rockets since 1949');
    expect(readFileSync(join(out, 'flag.svg'), 'utf8')).not.toContain('rockets since 1949');
  });

  it('replaces the bars with --charge, stripping the file’s own <svg> wrapper', async () => {
    const charge = join(dir, 'charge.svg');
    writeFileSync(charge, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="own-charge" cx="50" cy="50" r="20"/></svg>\n');
    const r = await json(['brand', ...PASSING, '--charge', charge]);
    const flag = String(r.data['flag']);
    expect(flag).toContain('<circle id="own-charge" cx="50" cy="50" r="20"/>');
    expect(flag.match(/<svg/g)).toHaveLength(1);
  });

  it('draws a bordure in the given colour, at the default hairline or the given width', async () => {
    const hairline = String((await json(['brand', ...PASSING, '--bordure', '#123456'])).data['flag']);
    // The flag draws the stroke at twice the declared width: half of it is clipped by the edge.
    expect(hairline).toMatch(/stroke="#123456" stroke-width="3"/);
    const thick = String((await json(['brand', ...PASSING, '--bordure', '#123456', '--bordure-width', '4'])).data['flag']);
    expect(thick).toMatch(/stroke="#123456" stroke-width="8"/);
    expect(String((await json(['brand', ...PASSING])).data['flag'])).not.toContain('#123456');
  });

  it('checks the flag against each --on colour, ignoring blanks in the list', async () => {
    const r = await json(['brand', ...PASSING, '--on', '#000000, ,#050505']);
    const what = (r.data['contrast'] as { what: string }[]).map((f) => f.what);
    expect(what).toEqual(['leading bar on its field', 'following bar on its field', 'flag edge on #000000', 'flag edge on #000000', 'flag edge on #050505', 'flag edge on #050505']);
  });

  it('refuses a failing contrast check before writing anything, and names the fix', async () => {
    const out = join(dir, 'refused');
    const r = await runCommand(program, ['brand', '--lead', '#101010', '--follow', '#141414', '--out', out]);
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stderr).toMatch(/contrast below WCAG AA:/);
    expect(r.stderr).toContain('hint: darken the --ground stop under the charge, or pass --allow-low-contrast');
    expect(() => readdirSync(out)).toThrow();
  });

  it('emits anyway under --allow-low-contrast, and the result says which checks failed', async () => {
    const r = await json(['brand', '--lead', '#101010', '--follow', '#141414', '--allow-low-contrast']);
    expect(r.code).toBe(ExitCode.OK);
    expect(r.data['contrast']).toEqual(expect.arrayContaining([expect.objectContaining({ passes: false })]));
  });

  it('moves the field’s midpoint with --ground', async () => {
    const own = String((await json(['brand', ...PASSING, '--ground', '#1b1b3a'])).data['flag']);
    const derived = String((await json(['brand', ...PASSING])).data['flag']);
    expect(own).toMatch(/#1b1b3a/i);
    expect(derived).not.toMatch(/#1b1b3a/i);
  });
});

describe('burgee dev', () => {
  it('hands the entry and the process’s own stdio to the dev loop, watching by default', async () => {
    const r = await runCommand(program, ['dev', './cli.ts']);
    expect(r.code).toBe(ExitCode.OK);
    expect(dev).toHaveBeenCalledWith({ entry: './cli.ts', input: processRuntime.stdin, output: processRuntime.stdout, log: processRuntime.stderr, watch: true });
  });
  it('turns the watcher off with --no-watch', async () => {
    await runCommand(program, ['dev', './cli.ts', '--no-watch']);
    expect(dev.mock.calls[0]?.[0]).toMatchObject({ watch: false });
  });
  it('refuses to start without an entry, before loading the dev loop', async () => {
    const r = await runCommand(program, ['dev']);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('missing required argument "entry"');
    expect(dev).not.toHaveBeenCalled();
  });
});

const project = (at: string): void => {
  writeFileSync(join(at, 'package.json'), JSON.stringify({ name: 'demo', dependencies: { commander: '^15.0.0' } }));
  writeFileSync(join(at, 'cli.js'), "import { Command } from 'commander';\nnew Command();\n");
};

describe('burgee migrate', () => {
  it('migrates the directory it is given, and --dry-run writes nothing', async () => {
    project(dir);
    const r = await json(['migrate', dir, '--dry-run']);
    expect(r.data).toMatchObject({ dryRun: true, changed: false, files: 1 });
    expect(r.data['mapped']).toEqual([expect.objectContaining({ from: 'commander', to: 'burgee/commander' })]);
    expect(readFileSync(join(dir, 'cli.js'), 'utf8')).toContain("from 'commander'");
  });
  it('migrates the working directory when none is given, and --force writes past a dirty tree', async () => {
    project(dir);
    // A repository whose two files are untracked: dirty, so only --force writes.
    execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' });
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const refused = await runCommand(program, ['migrate']);
    expect(refused.code).not.toBe(ExitCode.OK);
    expect(refused.stderr).toContain('the git tree has 2 uncommitted changes');
    expect(readFileSync(join(dir, 'cli.js'), 'utf8')).toContain("from 'commander'");
    const r = await json(['migrate', '--force']);
    expect(r.data['changed']).toBe(true);
    expect(readFileSync(join(dir, 'cli.js'), 'utf8')).toContain("from 'burgee/commander'");
  });
  it('hands --only and --skip to the engine as lists, and leaves them out when not typed (U12-3)', async () => {
    project(dir);
    const skipped = await json(['migrate', dir, '--dry-run', '--skip', 'commander']);
    expect(skipped.data).toMatchObject({ files: 0, mapped: [] });
    const only = await json(['migrate', dir, '--dry-run', '--only', 'chalk,commander']);
    expect(only.data).toMatchObject({ files: 1 });
  });
  it('prints the report as text, its first line the summary (U12-5)', async () => {
    project(dir);
    const r = await runCommand(program, ['migrate', dir, '--dry-run']);
    expect(r.stdout.split('\n')[0]).toBe('complete: 1 file would be rewritten');
  });
});

describe('burgee check', () => {
  it('loads the named plugin file and reports what it contributes', async () => {
    const file = join(dir, 'plugin.mjs');
    writeFileSync(file, "export default { name: 'hello', contract: 1, commands: [{ path: ['hello'], description: 'Say hello', effects: 'read_only', options: {}, run: () => 'hi' }] };\n");
    const r = await json(['check', file]);
    expect(r.code).toBe(ExitCode.OK);
    expect(r.data).toEqual({ name: 'hello', commands: [{ path: 'hello', description: 'Say hello', effects: 'read_only' }], hooks: [] });
  });

  it('says ok: true in its --json envelope when it exits 0', async () => {
    const file = join(dir, 'plugin.mjs');
    writeFileSync(file, "export default { name: 'hello', contract: 1, hooks: { preRun: { handler() {} } } };\n");
    const r = await runCommand(program, ['check', file, '--json']);
    expect(r.code).toBe(ExitCode.OK);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, data: { name: 'hello' } });
  });

  it('says ok: false in its --json envelope on a refusal, because it exits 1, and still carries the fix', async () => {
    // Until this case the envelope said `ok: true` while the process exited 1: an agent that
    // read `ok`, the field the envelope exists to answer, was told a refused plugin worked.
    const file = join(dir, 'plugin.mjs');
    writeFileSync(file, "export default { name: 'old' };\n");
    const r = await runCommand(program, ['check', file, '--json']);
    const envelope = JSON.parse(r.stdout) as { ok: boolean; data: { refused: { code: string; fix: string }; exitCode: number } };
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(envelope.ok, 'the envelope must agree with the exit code').toBe(false);
    expect(envelope.data.refused).toMatchObject({ code: 'E_PLUGIN_CONTRACT', fix: expect.stringContaining('contract: 1') });
    expect(envelope.data.exitCode).toBe(ExitCode.RUNTIME);
  });
});
