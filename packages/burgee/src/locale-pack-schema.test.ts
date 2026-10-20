/**
 * `locale-pack-in-five` R2 — the published pack schema shows a whole pack module, so an agent
 * writing one reads the shape off the schema instead of searching the source for it.
 *
 * D-20261012-agent-eval-turn-budget measured one run spending 11 model turns looking for how a
 * pack is written as a module: the schema showed the shape with `…` where the messages go, and
 * the one example pack is JSON. The module in the description is checked here the way an author
 * checks theirs, by `burgee check`, so it can never drift into one the check refuses.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { type CheckReport, checkPlugin } from './check.js';

const schema = JSON.parse(readFileSync(new URL('locale-pack-schema.json', import.meta.url), 'utf8')) as { description: string };

/** The module the description holds: the backticked span that starts `export default`. */
const whole = /`(export default \{.*?\};)`/u.exec(schema.description)?.[1];

const dir = mkdtempSync(join(tmpdir(), 'burgee-pack-schema-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the locale pack schema shows a whole module (locale-pack-in-five R2)', () => {
  it('holds one, under 600 bytes, so it costs a reader little and is copied whole', () => {
    expect(whole).toBeDefined();
    expect(Buffer.byteLength(whole as string)).toBeLessThan(600);
  });

  it('is a pack burgee check accepts, with a plural message in all three of French’s forms', async () => {
    const file = join(dir, 'fr.mjs');
    writeFileSync(file, `${whole as string}\n`);
    const report = (await checkPlugin(file)) as CheckReport;
    expect(report).not.toHaveProperty('refused');
    const [fr] = report.locales ?? [];
    expect(fr?.locale).toBe('fr');
    expect(fr?.coverage.plural['usage.stdinOnce']).toEqual({ have: ['one', 'many', 'other'], need: ['one', 'many', 'other'] });
  });

  it('says the check prints what the pack covers, so the check is the verification', () => {
    expect(schema.description).toMatch(/burgee check <pack> --json/u);
    expect(schema.description).toMatch(/`coverage`/u);
  });
});
