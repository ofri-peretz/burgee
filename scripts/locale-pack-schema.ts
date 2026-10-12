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
 * What it cannot — which plural forms a locale selects, which depends on `Intl.PluralRules` —
 * `burgee check` refuses at run time, in the same words a registered pack is refused in.
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

function messageOf(english: string): Record<string, unknown> {
  const text = textOf(english);
  if (!english.includes('{count}')) return { description: english, ...text };
  return {
    description: `${english} — a string, or one string per plural form Intl.PluralRules selects for the locale`,
    anyOf: [text, { type: 'object', propertyNames: { enum: FORMS }, required: ['other'], additionalProperties: text }],
  };
}

export function packSchema(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://burgee.interlace.tools/locale-pack-schema.json',
    title: 'burgee locale pack',
    description:
      "A plugin that translates burgee's human surfaces — usage errors, hints, help headings, the root's line for agents and the exit-code advice — into one or more languages. Register it with `program.use(pack)`; a run whose locale (the program's `locale` option, then BURGEE_LOCALE, LC_ALL, LC_MESSAGES, LANG) has a pack speaks it. Machine surfaces (--json, --schema, --mcp, --format=agent, error kinds, exit codes) never change. Check one with `burgee check <pack>`. Generated from packages/burgee/src/messages.ts by scripts/locale-pack-schema.ts.",
    type: 'object',
    required: ['name', 'contract', 'locales'],
    properties: {
      name: { type: 'string', minLength: 1, description: 'What a refusal names the pack by.' },
      contract: { const: 1, description: "The family plugin contract; `definePlugin` from 'burgee/plugin' stamps it." },
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
