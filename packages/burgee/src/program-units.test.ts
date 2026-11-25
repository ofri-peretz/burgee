/**
 * `burgee`'s own command line (`program.ts`) as data and at its edges: the whole `--schema`
 * document pinned, so every description, default and requirement an agent reads is held, and
 * what `brand` and `migrate` do with an option left out.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { defineBurgee, opposedField } from './brand.js';
import { runCommand } from './execute.js';
import { program } from './program.js';

const migrate = vi.hoisted(() => vi.fn((_opts: Record<string, unknown>) => Promise.resolve({ ok: true })));
vi.mock('./migrate.js', () => ({ migrate }));

const colours = { lead: '#f5a623', follow: '#4ecdc4' };
const PASSING = ['--lead', colours.lead, '--follow', colours.follow];
const scratch = (): string => mkdtempSync(join(tmpdir(), 'burgee-program-units-'));

/** What `brand --json` returned. */
async function brand(argv: string[]): Promise<{ flag?: string; files: string[]; contrast: unknown[] }> {
  const { stdout } = await runCommand(program, ['brand', ...PASSING, ...argv, '--json']);
  return (JSON.parse(stdout) as { data: { flag?: string; files: string[]; contrast: unknown[] } }).data;
}

describe('the schema an agent reads', () => {
  it('is pinned whole', async () => {
    const { stdout, code } = await runCommand(program, ['--schema']);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchSnapshot();
  });
});

describe('brand, with an option left out', () => {
  const plain = defineBurgee({ mark: colours, field: opposedField(colours, undefined) });

  it('draws no name and no outline', async () => {
    expect((await brand([])).flag).toBe(plain.flag(512));
  });

  it('writes a card with no subtitle, into a directory it makes, however deep', async () => {
    const out = join(scratch(), 'a', 'b');
    expect((await brand(['--out', out])).files).toContain('og.svg');
    expect(readFileSync(join(out, 'og.svg'), 'utf8')).toBe(`${plain.og({})}\n`);
  });

  it('takes a charge’s contents without its svg element', async () => {
    const file = join(scratch(), 'charge.svg');
    writeFileSync(file, '<svg viewBox="0 0 100 100">\n  <circle cx="50" cy="50" r="10"/>\n</svg>\n');
    const charged = defineBurgee({ mark: colours, field: opposedField(colours, undefined), charge: '<circle cx="50" cy="50" r="10"/>' });
    expect((await brand(['--charge', file])).flag).toBe(charged.flag(512));
  });
});

describe('migrate, with --only and --skip left out', () => {
  it('passes neither key at all', async () => {
    migrate.mockClear();
    await runCommand(program, ['migrate', '/nowhere']);
    expect(Object.keys(migrate.mock.calls[0]?.[0] ?? {}).toSorted()).toEqual(['dir', 'dryRun', 'force']);
  });

  it('passes each as given', async () => {
    migrate.mockClear();
    await runCommand(program, ['migrate', '/nowhere', '--only', 'commander', '--skip', 'yargs']);
    expect(migrate.mock.calls[0]?.[0]).toMatchObject({ only: ['commander'], skip: ['yargs'] });
  });
});
