/**
 * A8 / A9 — `burgee migrate` as a caller actually meets it, through the real binary.
 *
 * The other migrate suites exercise the engine in-process, which is the right place for the
 * scanner's cases and the wrong place for two claims: that the **exit code** reaches the
 * shell, and that `--help --json`, `--schema` and the E1 contract are the framework's rather
 * than this feature's. Both of those only exist once something has actually exited, so this
 * runs `dist/cli.js` as a subprocess — `turbo.json` makes `test` depend on `build`, so the
 * binary is the one that would ship.
 *
 * **The fifth named mutation dies here**: a command that reports its refusals and exits `0`
 * passes every in-process case and tells an unattended agent the migration is complete.
 */
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';

const CLI = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist/cli.js');

interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

function burgee(args: string[]): Ran {
  const options: ExecFileSyncOptions = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  try {
    return { code: ExitCode.OK, stdout: String(execFileSync(process.execPath, [CLI, ...args], options)), stderr: '' };
  } catch (cause) {
    const e = cause as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
  }
}

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'burgee-migrate-cli-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const envelope = (out: string): { ok: boolean; data: Record<string, unknown> } => JSON.parse(out) as never;

/** Since U12-3 an incumbent moves only when the project declares it. */
const DECLARES_COMMANDER = JSON.stringify({ name: 'x', dependencies: { commander: '^15.0.0' } });

describe('the built binary', () => {
  it('has been built — every case below runs it, so a missing dist must fail loudly', () => {
    expect(existsSync(CLI), `${CLI} is missing; \`turbo run test\` builds it first`).toBe(true);
  });
});

describe('A9 — the surfaces are the framework’s, not this feature’s', () => {
  it('answers --help --json with the command as data, naming the flag an agent has to type', () => {
    const { code, stdout } = burgee(['migrate', '--help', '--json']);
    const doc = JSON.parse(stdout) as { name: string; effects: string; inputSchema: { properties: Record<string, { flag?: string }> } };
    expect(code).toBe(ExitCode.OK);
    expect(doc.name).toContain('migrate');
    expect(doc.effects, 'N6 — a command that runs declares what it does to the world').toBe('idempotent');
    // The declared name is camelCase and the flag is kebab, so the *flag* is what is asserted:
    // an agent reading `dryRun` and typing `--dryRun` is the failure this field exists to stop.
    expect(doc.inputSchema.properties['dryRun']?.flag).toBe('--dry-run');
    expect(doc.inputSchema.properties['force']?.flag).toBe('--force');
    // U12-3: the two selection flags are the manifest's, so they reach every surface with it.
    expect(doc.inputSchema.properties['only']).toMatchObject({ flag: '--only', type: 'array' });
    expect(doc.inputSchema.properties['skip']).toMatchObject({ flag: '--skip', type: 'array' });
  });

  it('appears in the program’s --schema without this feature publishing one', () => {
    const { code, stdout } = burgee(['--schema']);
    expect(code).toBe(ExitCode.OK);
    expect(stdout).toContain('migrate');
    expect(stdout).toContain('"only"');
    expect(stdout).toContain('"skip"');
  });

  it('answers --help in prose, with the examples the declaration carries', () => {
    const { code, stdout } = burgee(['migrate', '--help']);
    expect(code).toBe(ExitCode.OK);
    expect(stdout).toContain('--dry-run');
    expect(stdout).toContain('--only <lib,…>');
    expect(stdout).toContain('--skip <lib,…>');
    expect(stdout).toContain('burgee migrate --json');
  });
});

describe('U12-2 — the versions next pins to ship with the binary', () => {
  it('wrote family-versions.json beside migrate.js, equal to every published manifest in this repository', () => {
    const packages = resolve(fileURLToPath(new URL('../..', import.meta.url)));
    const expected = Object.fromEntries(
      readdirSync(packages, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(packages, e.name, 'package.json')))
        .map((e) => JSON.parse(readFileSync(join(packages, e.name, 'package.json'), 'utf8')) as { name: string; version: string; private?: boolean })
        .filter((pkg) => pkg.private !== true)
        .map((pkg) => [pkg.name, pkg.version]),
    );
    const built = JSON.parse(readFileSync(resolve(dirname(CLI), 'family-versions.json'), 'utf8')) as Record<string, string>;
    expect(built).toEqual(expected);
  });
});

describe('A8 — an agent branches on the code and reads the reason from `refused`', () => {
  it('exits OK and emits the report when everything mapped', () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { commander: '^15.0.0' } }), 'src/a.ts': "import { Command } from 'commander';\n" });
    const { code, stdout } = burgee(['migrate', dir, '--json']);
    const { ok, data } = envelope(stdout);
    expect(code).toBe(ExitCode.OK);
    expect(ok).toBe(true);
    expect(data).toMatchObject({ files: 1, imports: 1, refused: [], changed: true, exitCode: ExitCode.OK });
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toBe("import { Command } from 'burgee/commander';\n");
  });

  it('exits RUNTIME with refusals present, and still emits the whole report', () => {
    // M-e. The document and the code are one answer: an agent that read only the document
    // would call this migration complete, and an agent that read only the code would not
    // know which file to open.
    const dir = project({ 'package.json': DECLARES_COMMANDER, 'src/a.ts': "import { Command } from 'commander/lib/command.js';\n" });
    const { code, stdout } = burgee(['migrate', dir, '--json']);
    const { ok, data } = envelope(stdout);
    expect(code, 'refusals present and the shell was told the run succeeded').toBe(ExitCode.RUNTIME);
    // This pinned `ok: true` until the envelope learned to agree with the exit code: it was
    // the lock on the very contradiction the comment above names.
    expect(ok, 'the envelope agrees with the exit code').toBe(false);
    expect(data['refused']).toEqual([{ file: 'src/a.ts', line: 1, specifier: 'commander/lib/command.js', reason: 'deep-import' }]);
  });

  it('exits OK under --dry-run when nothing was refused, having written nothing', () => {
    const dir = project({ 'package.json': DECLARES_COMMANDER, 'src/a.ts': "import { Command } from 'commander';\n" });
    const { code, stdout } = burgee(['migrate', dir, '--dry-run', '--json']);
    expect(code).toBe(ExitCode.OK);
    expect(envelope(stdout).data).toMatchObject({ files: 1, dryRun: true, changed: false });
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toBe("import { Command } from 'commander';\n");
  });

  it('prints the report on the text surface too', () => {
    // Restated 2026-10-08 (U12-5): this asserted `files: 1` and `imports: 1`, the engine's
    // one-level rendering, which printed every list in the report as a line of JSON.
    const dir = project({ 'package.json': DECLARES_COMMANDER, 'src/a.ts': "import { Command } from 'commander';\n" });
    const { code, stdout } = burgee(['migrate', dir]);
    expect(code).toBe(ExitCode.OK);
    expect(stdout.split('\n')[0]).toBe('complete: 1 file rewritten');
    expect(stdout).toContain('commander -> burgee/commander  1 import in 1 file');
    expect(stdout, 'no field prints as raw JSON').not.toMatch(/[[{]"/);
  });

  it('says a run that refused something is partial, in the text and the code', () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { commander: '^15.0.0', chalk: '^6.0.0' } }),
      'src/a.ts': "import chalk from 'chalk';\n",
      'src/b.ts': "import 'commander/lib/help.js';\n",
    });
    const { code, stdout } = burgee(['migrate', dir]);
    expect(code).toBe(ExitCode.RUNTIME);
    expect(stdout.split('\n')[0]).toBe('partial: 1 file rewritten, 1 refused');
    expect(stdout).toContain('src/b.ts:1  commander/lib/help.js  deep-import');
  });
});

describe('U12-3 — --only and --skip, through the binary', () => {
  it('moves only what --only names, comma-separated', () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { chalk: '^6.0.0', ora: '^9.0.0' } }), 'src/a.ts': "import chalk from 'chalk';\nimport ora from 'ora';\n" });
    const { code, stdout } = burgee(['migrate', dir, '--only', 'ora,chalk', '--skip', 'chalk', '--json']);
    expect(code).toBe(ExitCode.OK);
    expect(envelope(stdout).data).toMatchObject({ mapped: [{ from: 'ora', to: 'flagstaff/ora' }] });
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toBe("import chalk from 'chalk';\nimport ora from 'flagstaff/ora';\n");
  });

  it('exits USAGE on a name it does not migrate, and writes nothing', () => {
    const dir = project({ 'package.json': DECLARES_COMMANDER, 'src/a.ts': "import { Command } from 'commander';\n" });
    const { code, stderr } = burgee(['migrate', dir, '--only', 'kleur']);
    expect(code).toBe(ExitCode.USAGE);
    expect(stderr).toContain('burgee migrate does not migrate kleur');
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toBe("import { Command } from 'commander';\n");
  });
});

describe('A6 — it refuses a dirty tree through the binary, with the fix on stderr', () => {
  it('names the count and exits RUNTIME', () => {
    const dir = project({ 'src/a.ts': "import { Command } from 'commander';\n" });
    execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' });
    const { code, stderr } = burgee(['migrate', dir]);
    expect(code).toBe(ExitCode.RUNTIME);
    expect(stderr).toContain('uncommitted change');
    // The fix was on the error and never printed, until 2026-09-30.
    expect(stderr).toContain('fix: commit or stash your changes, or pass --force');
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toBe("import { Command } from 'commander';\n");
  });
});
