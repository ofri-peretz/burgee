/**
 * Writes `packages/burgee/src/locale-pack-schema.json` from the catalog in
 * `packages/burgee/src/messages.ts` — the JSON Schema published at
 * `burgee/locale-pack-schema.json` that a locale pack is written against
 * (`localised-human-surfaces` R4).
 *
 *   npx tsx scripts/locale-pack-schema.ts [--check]
 *
 * One property per catalog id, each with its English as the `description`, so an agent given
 * the schema and one example has every id and every sentence it translates. What a schema can
 * say, it says: no id outside the catalog, and no `{placeholder}` the English does not carry.
 * What it cannot enforce — which plural forms a locale selects, which depends on
 * `Intl.PluralRules` — it names for the common languages in the plural message's description,
 * with a French example, and `burgee check` refuses at run time, in the same words a
 * registered pack is refused in, every problem at once.
 * `scripts/locale-pack-schema-lock.test.ts` fails when the committed file differs from this.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: the catalog is source, not an export, and a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree
import { MESSAGES } from '../packages/burgee/src/messages.js';

export const SCHEMA_PATH = fileURLToPath(new URL('../packages/burgee/src/locale-pack-schema.json', import.meta.url));

/** Every plural category CLDR names; which of them a locale needs is `burgee check`'s to say. */
const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** A translation of `english`: any text, any `{` that does not open a placeholder, and only the placeholders it has. */
function textOf(english: string): Record<string, unknown> {
  const names = [...english.matchAll(/\{(\w+)\}/gu)].map((m) => m[1] as string);
  const known = names.length === 0 ? '' : `|\\{(?:${names.join('|')})\\}`;
  return { type: 'string', pattern: `^(?:[^{]${known}|\\{(?!\\w+\\}))*$` };
}

/**
 * Languages whose plural forms a plural message's description names, one of each shape CLDR
 * has, so the rule is read off the schema rather than learned from a refusal. Until 2026-10-12
 * the description said only "the forms Intl.PluralRules selects", the one example pack was
 * German's `one, other`, and every agent writing French copied it and was refused for `many`
 * (D-20261012-agent-eval-turn-budget).
 */
const PLURAL_SHAPES = ['en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'pl', 'ar', 'ja'];

/** `fr: one, many, other` — read from the engine, in CLDR's order, never written by hand. */
function formsByLanguage(): string {
  const byForms = new Map<string, string[]>();
  for (const tag of PLURAL_SHAPES) {
    const selected = new Intl.PluralRules(tag).resolvedOptions().pluralCategories as string[];
    const forms = FORMS.filter((form) => selected.includes(form)).join(', ');
    byForms.set(forms, [...(byForms.get(forms) ?? []), tag]);
  }
  return [...byForms].map(([forms, tags]) => `${tags.join(', ')}: ${forms}`).join('; ');
}

/** French, the case the German example does not show: `many` beside `one` and `other`. */
const FRENCH_COUNT = { one: '{count} argument de fichier', many: '{count} d’arguments de fichier', other: '{count} arguments de fichier' };

/**
 * A whole pack, as the module an author writes, three plural forms and all (`locale-pack-in-five`
 * R2). Until 2026-10-20 the description showed the shape with `…` where the messages go, and the
 * one example pack is JSON, so one measured run spent 11 model turns searching the source for how
 * a pack is written as a module (D-20261012-agent-eval-turn-budget).
 * `packages/burgee/src/locale-pack-schema.test.ts` runs `burgee check` on it.
 */
const quoted = (text: string): string => `'${text.replaceAll("'", "\\'")}'`;
const FRENCH_MODULE = `export default { name: 'fr', contract: 1, locales: { fr: { 'usage.unknownOption': 'option inconnue {option}', 'usage.stdinOnce': { ${Object.entries(FRENCH_COUNT)
  .map(([form, text]) => `${form}: ${quoted(text)}`)
  .join(', ')} } } } };`;

function messageOf(english: string): Record<string, unknown> {
  const text = textOf(english);
  if (!english.includes('{count}')) return { description: english, ...text };
  return {
    description: `${english} — a string, or an object with exactly the plural forms Intl.PluralRules selects for the locale (new Intl.PluralRules(tag).resolvedOptions().pluralCategories), no more and no fewer: ${formsByLanguage()}. French needs "many" (1000000) as well as "one" and "other", which a copy of a German pack lacks.`,
    anyOf: [text, { type: 'object', propertyNames: { enum: FORMS }, required: ['other'], additionalProperties: text, examples: [FRENCH_COUNT] }],
  };
}

export function packSchema(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://burgee.interlace.tools/locale-pack-schema.json',
    title: 'burgee locale pack',
    description:
      `A plugin that translates burgee's human surfaces — usage errors, hints, help headings, the root's line for agents and the exit-code advice — into one or more languages. Register it with \`program.use(pack)\`; a run whose locale (the program's \`locale\` option, then BURGEE_LOCALE, LC_ALL, LC_MESSAGES, LANG) has a pack speaks it. Machine surfaces (--json, --schema, --mcp, --format=agent, error kinds, exit codes) never change. A pack is plain data, a module's default export with nothing to import. A whole one, with a plural message in the three forms French needs: \`${FRENCH_MODULE}\` Check one with \`burgee check <pack> --json\`, which prints \`{ ok, data }\` where \`ok\` is the exit status (\`true\` is exit 0), so one run answers both: it refuses with every problem at once, each with a \`fix\`, and on success gives each locale's \`coverage\`: the ids \`translated\`, the ids \`missing\` (they stay in English), and for each plural id the forms written (\`have\`) against the forms the locale selects (\`need\`). Generated from packages/burgee/src/messages.ts by scripts/locale-pack-schema.ts.`,
    type: 'object',
    required: ['name', 'contract', 'locales'],
    properties: {
      name: { type: 'string', minLength: 1, description: 'What a refusal names the pack by.' },
      contract: { const: 1, description: "The family plugin contract: write `1`. `definePlugin` from 'burgee/plugin' stamps it too, but a plain object needs no import." },
      locales: {
        type: 'object',
        description: 'A BCP 47 language tag, as Intl.Locale writes it (de, de-DE, pt-BR), to its messages. A run looks for its own tag first, then the bare language.',
        minProperties: 1,
        propertyNames: { pattern: '^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$' },
        additionalProperties: { $ref: '#/$defs/messages' },
      },
    },
    $defs: {
      messages: {
        type: 'object',
        description: "Catalog id to translation. Leave an id out and that message stays in English. An id under `caique.` is caique's prompt chrome, checked by caique; one pack serves both.",
        patternProperties: { '^caique\\.': {} },
        additionalProperties: false,
        properties: Object.fromEntries(Object.entries(MESSAGES).map(([id, english]) => [id, messageOf(english)])),
      },
    },
  };
}

export const rendered = (): string => `${JSON.stringify(packSchema(), null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    if (readFileSync(SCHEMA_PATH, 'utf8') !== rendered()) {
      process.stderr.write('locale-pack-schema.json is stale: run npx tsx scripts/locale-pack-schema.ts\n');
      process.exitCode = 1;
    }
  } else {
    writeFileSync(SCHEMA_PATH, rendered());
  }
}
