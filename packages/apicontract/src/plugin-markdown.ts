/**
 * The built-in `markdown` target (apicontract-agents R5): `explain` for every operation, written
 * as one page each, plus an `index.md` and an `llms.txt`, so an agent without this CLI reads the
 * same text an agent with it gets from `apicontract explain`. Point the target's `out` at
 * `docs/api`.
 *
 * It calls `explain`'s own functions (R2, R3) and never a resolver of its own.
 */
import { stableHash, fileSlug, unique } from './command-explain-name.js';
import { capped, describe, type Explanation } from './command-explain-operation.js';
import { toMarkdown } from './command-explain-text.js';
import { type Contract } from './core/model.js';
import { type GeneratedFile, type Generator, type Options, type Plugin } from './host.js';

/** A value's own members, read as a record: `{}` for null and undefined, so a missing member reads as `undefined`. */
const membersOf = (value: unknown): Record<string, unknown> => Object(value) as Record<string, unknown>;

/** The longest page stem `fileSlug` makes. */
const MAX_FILE = 100;

/** `info.title` and `info.description`, when the document has them (OpenAPI and AsyncAPI do). */
const info = (document: unknown): { title: string; description?: string } => {
  const declared = membersOf(membersOf(document).info);
  const title = typeof declared.title === 'string' && declared.title !== '' ? declared.title : 'API';
  return typeof declared.description === 'string' && declared.description !== '' ? { title, description: declared.description } : { title };
};

/** What a link to a page says after the id: the route, then the summary, whichever exist. */
const blurb = (explanation: Explanation): string =>
  [explanation.method === undefined ? undefined : `\`${explanation.method} ${explanation.path as string}\``, explanation.summary].filter((part) => part !== undefined).join(' — ');

/** A page name for each id: its slug, never `index` (the index is `index.md`), unique ignoring case. */
const pages = (ids: readonly string[]): Map<string, string> =>
  unique(
    ids,
    (id) => {
      const slug = fileSlug(id);
      return slug.toLowerCase() === 'index' ? `${slug}_${stableHash(id)}` : slug;
    },
    MAX_FILE,
  );

const write = (path: string, lines: readonly string[]): GeneratedFile => ({ path, owner: 'generated', content: `${lines.join('\n')}\n` });

export const run = (contract: Contract, options: Options): GeneratedFile[] => {
  const maxBytes = typeof options.maxBytes === 'number' ? options.maxBytes : undefined;
  const explained = contract.operations.map((operation) => capped(describe(contract, operation), maxBytes));
  const names = pages(explained.map((explanation) => explanation.id));
  const { title, description } = info(contract.document);
  const links = explained.map((explanation) => {
    const text = blurb(explanation);
    return { link: `[${explanation.id}](${names.get(explanation.id) as string}.md)`, text };
  });
  const lead = description === undefined ? [] : [description, ''];
  return [
    ...explained.map((explanation) => ({ path: `${names.get(explanation.id) as string}.md`, owner: 'generated' as const, content: toMarkdown(explanation) })),
    write('index.md', [`# ${title}`, '', ...lead, ...links.map(({ link, text }) => `- ${link}${text === '' ? '' : ` — ${text}`}`)]),
    // llmstxt.org: an H1, a blockquote summary, then H2 sections of `- [name](url): notes` links.
    write('llms.txt', [
      `# ${title}`,
      '',
      `> ${description ?? 'Every operation of this API, one Markdown page each, with every schema resolved.'}`,
      '',
      '## Operations',
      '',
      ...links.map(({ link, text }) => `- ${link}${text === '' ? '' : `: ${text}`}`),
    ]),
  ];
};

/** The sample: two operations, one with a reference and a summary, one bare. */
const document = {
  openapi: '3.1.0',
  info: { title: 'Pets' },
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        summary: 'List pets',
        responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } },
      },
    },
    '/health': { get: { operationId: 'index', responses: { '204': {} } } },
  },
  components: { schemas: { Pet: { type: 'object', properties: { id: { type: 'string' } } } } },
};

const LIST_PETS = `# listPets

\`GET /pets\` · openapi \`#/paths/~1pets/get\`

List pets

## response:200:application/json

response, required

\`\`\`json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string"
      }
    }
  }
}
\`\`\`
`;

const INDEX_PAGE = `# index

\`GET /health\` · openapi \`#/paths/~1health/get\`

## response:204

response, required

\`\`\`json
false
\`\`\`
`;

const INDEX_NAME = `index_${stableHash('index')}`;

const markdown: Generator = {
  description: 'One Markdown page per operation, every schema resolved (what `explain` prints), plus index.md and llms.txt',
  inputs: ['openapi', 'swagger2', 'asyncapi', 'mcp', 'jsonschema'],
  options: {
    maxBytes: { type: 'number', description: 'cap each page as `explain --max-bytes` does: deepest schemas first' },
  },
  sample: {
    document,
    files: [
      { path: 'listPets.md', owner: 'generated', content: LIST_PETS },
      { path: `${INDEX_NAME}.md`, owner: 'generated', content: INDEX_PAGE },
      { path: 'index.md', owner: 'generated', content: `# Pets\n\n- [listPets](listPets.md) — \`GET /pets\` — List pets\n- [index](${INDEX_NAME}.md) — \`GET /health\`\n` },
      {
        path: 'llms.txt',
        owner: 'generated',
        content: `# Pets\n\n> Every operation of this API, one Markdown page each, with every schema resolved.\n\n## Operations\n\n- [listPets](listPets.md): \`GET /pets\` — List pets\n- [index](${INDEX_NAME}.md): \`GET /health\`\n`,
      },
    ],
  },
  run,
};

export const plugin: Plugin = { name: 'markdown', generators: { markdown } };
