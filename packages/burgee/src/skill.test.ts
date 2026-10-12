/**
 * agent-skill R2 and R3 — the Agent Skill a program prints for `--skill`, and the two files
 * `burgee skill` writes beside its binary.
 *
 * The front-matter rules are the Agent Skills specification's (agentskills.io/specification,
 * `agentskills/agentskills` at `69ef37e9`, read 2026-10-12): `name` 1–64 characters of `a-z`,
 * `0-9` and `-`, no leading, trailing or doubled `-`; `description` 1–1024 characters.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { defineCommand, defineError, defineProgram, ExitCode, type RunContext, runCommand } from './index.js';
import { Manifest, type OptionSpec } from './manifest.js';
import { program as burgee } from './program.js';
import { binDirOf } from './skill-files.js';
import { DESCRIPTION_MAX, NAME_MAX, renderAgents, renderSkill, skillName } from './skill.js';
import { shellWord } from './unknown-option.js';

const ok = (): string => 'ok';

/** A command line as `--check` prints it: each word quoted for a shell when it needs to be (a Windows path does). */
const line = (...words: string[]): string => words.map(shellWord).join(' ');

/** The reference demo's shape: a group among leaves, an example per command. */
const demo = defineProgram({
  name: 'demo',
  description: 'The burgee reference demo',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'Greet someone',
      effects: 'read_only',
      arguments: [{ name: 'name', description: 'who to greet', required: true }],
      examples: [{ command: 'demo greet ada --shout', description: 'greet ada, loudly' }],
      options: { shout: { type: 'boolean', description: 'uppercase the greeting' } },
      run: ok,
    }),
    defineCommand({
      name: 'config',
      description: 'Read configuration',
      commands: [defineCommand({ name: 'get', description: 'Print one configuration value', effects: 'read_only', arguments: [{ name: 'key', required: true }], examples: [{ command: 'demo config get user.name --json' }], run: ok })],
    }),
    defineCommand({ name: 'fail', description: 'Fail on purpose', effects: 'idempotent', run: ok }),
    defineCommand({ name: 'hush', description: 'Never listed', hidden: true, effects: 'withheld', run: ok }),
  ],
});

/** A program whose root runs, as `run(command)` builds one. */
function rootThatRuns(name: string, options: Record<string, OptionSpec>, run: (ctx: RunContext) => unknown): Manifest {
  const manifest = new Manifest();
  manifest.rootPath = [name];
  manifest.add({ path: [name], options, effects: 'read_only', run });
  return manifest;
}

/** The specification's rules, as the front matter must meet them. */
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function frontMatter(skill: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  if (match === null) throw new Error(`no front matter:\n${skill}`);
  return Object.fromEntries(
    (match[1] as string).split('\n').map((l) => {
      const [key, ...rest] = l.split(': ');
      const value = rest.join(': ');
      return [key as string, value.startsWith('"') ? (JSON.parse(value) as string) : value];
    }),
  );
}

/** The exit-code table's rows, cell by cell, backticks dropped. */
const rows = (skill: string): string[][] =>
  skill
    .split('\n')
    .filter((l) => /^\| `\d+` \|/.test(l))
    .map((l) => l.split(' | ').map((c) => c.replace(/^\| /, '').replaceAll('`', '')));

describe('--skill prints an Agent Skill (agent-skill R2)', () => {
  it('answers --skill with the skill, exit 0', async () => {
    const { stdout, code } = await runCommand(demo, ['--skill']);
    expect(code).toBe(ExitCode.OK);
    expect(stdout).toBe(renderSkill(demo));
  });

  it('front matter: a name and a description within the specification limits', () => {
    const meta = frontMatter(renderSkill(demo));
    expect(Object.keys(meta)).toEqual(['name', 'description']);
    expect(meta['name']).toBe('demo');
    expect(meta['name']).toMatch(NAME);
    expect((meta['name'] as string).length).toBeLessThanOrEqual(NAME_MAX);
    expect(meta['description']).toBe('The burgee reference demo. Use it to greet someone, print one configuration value or fail on purpose.');
    expect((meta['description'] as string).length).toBeGreaterThan(0);
    expect((meta['description'] as string).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it('names every runnable command, with its first example, and no hidden one', () => {
    const skill = renderSkill(demo);
    expect(skill).toContain('- `demo greet <name>`: Greet someone. Example: `demo greet ada --shout`\n');
    expect(skill).toContain('- `demo config get <key>`: Print one configuration value. Example: `demo config get user.name --json`\n');
    expect(skill).toContain('- `demo fail`: Fail on purpose.\n');
    expect(skill).not.toContain('hush');
  });

  it('the exit-code table is ExitCode, with each kind, and a defined error follows the contract', () => {
    const contract = rows(renderSkill(demo));
    expect(contract.map(([code]) => Number(code))).toEqual(Object.values(ExitCode));
    expect(contract.map(([, kind]) => kind)).toEqual(['ok', 'runtime', 'usage', 'config', 'cancelled', 'auth', 'timeout', 'interrupted']);
    expect(contract.find(([, kind]) => kind === 'timeout')?.[2]).toBe('yes');
    defineError({ name: 'SkillQuotaError', code: 77, retryable: true, description: 'the quota | ran out' });
    expect(rows(renderSkill(demo)).at(-1)).toEqual(['77', 'skill_quota', 'yes', 'the quota \\| ran out |']);
  });

  it('inlines no option table: the options are behind --schema <command>, which it names', () => {
    const skill = renderSkill(demo);
    expect(skill).not.toContain('| `--shout`');
    expect(skill).not.toContain('## Options');
    expect(skill).not.toContain('uppercase the greeting');
    expect(skill).toContain('`demo --schema <command>`');
    expect(skill).toContain('`--explain <option>`');
    expect(skill).toContain('`--json`');
  });

  it('a runnable root is a command of its own, and a program with no description still has one', async () => {
    const solo = rootThatRuns('solo', {}, ok);
    const meta = frontMatter(renderSkill(solo));
    expect(meta['description']).toBe('The solo command line.');
    expect(renderSkill(solo)).toContain('- `solo`\n');
    expect((await runCommand(solo, ['--skill'])).stdout).toBe(renderSkill(solo));
  });

  it('a root that declares its own --skill keeps it', async () => {
    const own = rootThatRuns('own', { skill: { type: 'boolean' } }, ({ options }) => (options['skill'] === true ? 'mine' : 'not'));
    expect((await runCommand(own, ['--skill'])).stdout).toBe('mine\n');
  });

  it('normalises a name to the specification: lowercase, hyphens, 64 characters, never empty', () => {
    expect(skillName('@acme/Deploy_CLI')).toBe('acme-deploy-cli');
    expect(skillName('--x--')).toBe('x');
    expect(skillName('部署')).toBe('cli');
    const long = skillName(`${'a'.repeat(63)}-b`);
    expect(long).toBe('a'.repeat(63));
    for (const n of ['@acme/Deploy_CLI', '--x--', '部署', `${'a'.repeat(63)}-b`]) expect(skillName(n)).toMatch(NAME);
  });

  it('a description past the limit is cut at a word, and one YAML would misread is quoted', () => {
    const many = defineProgram({
      name: 'many',
      description: 'Many things: a list',
      commands: Array.from({ length: 80 }, (_, i) => defineCommand({ name: `c${String(i)}`, description: `Do the thing number ${String(i)}`, effects: 'read_only', run: ok })),
    });
    const skill = renderSkill(many);
    const meta = frontMatter(skill);
    expect((meta['description'] as string).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(meta['description']).toMatch(/…$/);
    expect(skill).toMatch(/^---\nname: many\ndescription: "Many things: a list\./);
  });

  it('keeps an acronym, a sentence already ended, and an error with no description, and needs no root node', () => {
    const tools = defineProgram({
      name: 'tools',
      description: 'Tools for agents.',
      commands: [defineCommand({ name: 'serve', description: 'MCP over stdio', effects: 'withheld', run: ok })],
    });
    expect(frontMatter(renderSkill(tools))['description']).toBe('Tools for agents. Use it to MCP over stdio.');
    defineError({ name: 'SkillBareError', code: 78 });
    defineError({ name: 'SkillTwoLineError', code: 79, description: 'first\nsecond' });
    expect(renderSkill(tools)).toContain('| `79` | `skill_two_line` | no | first<br>second |\n');
    expect(renderSkill(tools)).toContain('| `78` | `skill_bare` | no |  |\n');
    const bare = new Manifest();
    bare.rootPath = ['bare'];
    bare.add({ path: ['bare', 'ping'], options: {}, effects: 'read_only', run: ok });
    expect(renderSkill(bare)).toContain('- `bare ping`\n');
    expect(frontMatter(renderSkill(bare))['description']).toBe('The bare command line.');
  });

  it('AGENTS.md is the same body under its own heading, with no front matter', () => {
    const skill = renderSkill(demo);
    const agents = renderAgents(demo);
    expect(agents.startsWith('# AGENTS.md — demo\n')).toBe(true);
    expect(agents).not.toContain('---\nname:');
    expect(agents.split('\n').slice(1)).toEqual(skill.slice(skill.indexOf('# demo\n')).split('\n').slice(1));
  });
});

const src = dirname(fileURLToPath(import.meta.url));
// The real path: on macOS `/tmp` is `/private/tmp`, and the bin's directory is resolved through it.
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'burgee-skill-')));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A package with a bin, and an entry exporting the demo-shaped program. */
function project(bin: unknown): string {
  const root = mkdtempSync(join(dir, 'pkg-'));
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fx', ...(bin === undefined ? {} : { bin }) }));
  const entry = join(root, 'cli.ts');
  writeFileSync(
    entry,
    `import { defineCommand, defineProgram } from ${JSON.stringify(resolve(src, 'index.ts'))};
export const program = defineProgram({ name: 'fx', description: 'A fixture', commands: [defineCommand({ name: 'ping', description: 'Answer', effects: 'read_only', examples: [{ command: 'fx ping' }], run: () => 'pong' })] });
`,
  );
  return entry;
}

describe('burgee skill writes the files an author ships (agent-skill R3)', () => {
  it('writes SKILL.md and AGENTS.md to the directory of the bin, and says what changed', async () => {
    const entry = project({ fx: './bin/fx.js' });
    const first = await runCommand(burgee, ['skill', entry, '--json']);
    expect(first.code, first.stderr).toBe(ExitCode.OK);
    const out = join(dirname(entry), 'bin');
    expect(JSON.parse(first.stdout)).toMatchObject({ ok: true, data: { out, files: ['SKILL.md', 'AGENTS.md'], changed: true } });
    expect(readFileSync(join(out, 'SKILL.md'), 'utf8')).toMatch(/^---\nname: fx\ndescription: A fixture\. Use it to answer\.\n---\n/);
    expect(readFileSync(join(out, 'AGENTS.md'), 'utf8')).toMatch(/^# AGENTS\.md — fx\n/);
    const again = await runCommand(burgee, ['skill', entry, '--json']);
    expect(JSON.parse(again.stdout)).toMatchObject({ data: { changed: false } });
  });

  it('--check exits 1 on a stale committed skill, naming the file and the line that fixes it', async () => {
    const entry = project('./bin/fx.js');
    const out = join(dirname(entry), 'bin');
    expect((await runCommand(burgee, ['skill', entry])).code).toBe(ExitCode.OK);
    expect((await runCommand(burgee, ['skill', entry, '--check'])).code).toBe(ExitCode.OK);
    writeFileSync(join(out, 'SKILL.md'), readFileSync(join(out, 'SKILL.md'), 'utf8').replace('Answer', 'Answers'));
    const stale = await runCommand(burgee, ['skill', entry, '--check', '--json']);
    expect(stale.code).toBe(ExitCode.RUNTIME);
    expect(JSON.parse(stale.stdout)).toMatchObject({ data: { stale: ['SKILL.md'], fix: line('burgee', 'skill', entry) } });
    // `--check` wrote nothing.
    expect(readFileSync(join(out, 'SKILL.md'), 'utf8')).toContain('Answers');
  });

  it('--out writes where it is told, and --check names it in the fix', async () => {
    const entry = project(undefined);
    const out = join(dirname(entry), 'my docs');
    expect((await runCommand(burgee, ['skill', entry, '--out', out])).code).toBe(ExitCode.OK);
    expect(readFileSync(join(out, 'SKILL.md'), 'utf8')).toContain('# fx\n');
    rmSync(join(out, 'AGENTS.md'));
    const stale = await runCommand(burgee, ['skill', entry, '--out', out, '--check', '--json']);
    expect(JSON.parse(stale.stdout)).toMatchObject({ data: { stale: ['AGENTS.md'], fix: line('burgee', 'skill', entry, '--out', out) } });
  });

  it('a package with no bin is refused with the flag that fixes it', () => {
    const entry = project(undefined);
    expect(() => binDirOf(entry)).toThrow(`${entry}: no "bin" in the package.json that owns it; pass --out <dir>`);
    expect(() => binDirOf(join(dirname(entry), 'bin', 'nothing.ts'))).toThrow(/no "bin"/);
    expect(() => binDirOf(project({ fx: 3 }))).toThrow(/no "bin"/);
  });
});
