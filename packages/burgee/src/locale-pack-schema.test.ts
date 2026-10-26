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

const schema = JSON.parse(readFileSync(new URL('locale-pack-schema.json', import.meta.url), 'utf8')) as {
  description: string;
  $defs: { messages: { properties: Record<string, { description: string }> } };
};

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

  // The second reading after R1 (run 39481745234) ran `check` twice on a pack the first run
  // accepted, the second time only to read the exit code. `ok` already is it (program.test.ts:
  // "says ok: false in its --json envelope on a refusal, because it exits 1").
  it('says the --json envelope’s `ok` is the exit status, so one check run answers both', () => {
    expect(schema.description).toMatch(/`ok` is the exit status/u);
  });
});

/**
 * `locale-pack-in-five` criterion 3: of the readings on the released product, two spent a call on
 * burgee, each on something the schema already said. Run 40086461208 ran
 * `new Intl.PluralRules('fr').resolvedOptions().pluralCategories` — the expression the plural
 * message's description printed beside the very list it computes. Run 40217253606 grepped
 * `messages.ts` for the English of the ids to translate, which is each id's `description` here,
 * and the top-level description never said so.
 */
describe('the locale pack schema leaves nothing to look up (locale-pack-in-five criterion 3)', () => {
  const plural = schema.$defs.messages.properties['usage.stdinOnce']?.description ?? '';

  it('names the plural forms per language, and prints no expression for an agent to run instead', () => {
    expect(plural).toMatch(/fr, es, it, pt: one, many, other/u);
    expect(plural).not.toMatch(/new Intl\.PluralRules\(/u);
    expect(plural).toMatch(/`coverage`/u);
  });

  it('says each id’s English is its description, so no run reads the source for it', () => {
    expect(schema.description).toMatch(/each id’s English, with the \{placeholders\} to keep, is its `description` under `\$defs\.messages`/u);
    expect(schema.$defs.messages.properties['help.forAgents']?.description).toMatch(/^For agents: /u);
  });
});
