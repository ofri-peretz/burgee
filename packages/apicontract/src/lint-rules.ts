/**
 * `lint`'s built-in rules and rulesets (apicontract-lint spec.md R8; contractdiff-compat-depth R7).
 *
 * - `recommended` is form only, every rule at `warn`: nothing fails until a team sets a rule to
 *   `error` (intent, "Defaults taken").
 * - `agent-ready` is what an agent needs from a contract it will call as tools: every operation,
 *   parameter and property described, descriptions short enough to sit in a tool list, examples
 *   that are valid, ids to name tools by, and no two operations an agent cannot tell apart. Its
 *   score is the share of the nodes it checked that passed.
 *
 * Every rule decides a fact; none asks whether a name is clear (intent, "code decides facts").
 */
import { type Operation } from './core/model.js';
import { inline } from './core/resolve.js';
import { type Level, type Rule } from './lint-engine.js';
import { validAgainst } from './lint-functions.js';
import { at, type LintNode } from './lint-select.js';

const HTTP = ['openapi', 'swagger2'];

/** A value's own members, read as a record: `{}` for null and undefined, so a missing member reads as `undefined`. */
const membersOf = (value: unknown): Record<string, unknown> => Object(value) as Record<string, unknown>;

/** The most characters an operation's description may take in a tool list. */
export const MAX_DESCRIPTION = 300;
/** Two operations whose descriptions share at least this share of their words read as one to an agent. */
export const OVERLAP = 0.8;
/** Words shorter than this carry no meaning for the overlap ("a", "of", "the"). */
const MIN_WORD = 4;

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** What an operation says about itself: its description, else its summary. */
const proseOf = (node: LintNode): string => textOf(node.value.description) || textOf(node.value.summary);

/** The distinct meaningful words of a text, lower case. */
// Stryker disable next-line Regex: equivalent, the empty strings a single separator leaves are shorter than MIN_WORD
export const wordsOf = (text: string): Set<string> => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= MIN_WORD));

/** Jaccard similarity of two word sets: shared words over all words. */
export const overlapOf = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  const shared = [...a].filter((word) => b.has(word)).length;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
};

/** Every `$ref` string anywhere in a document. */
const refsIn = (value: unknown): string[] => {
  // Stryker disable next-line ArrayDeclaration: equivalent, every caller keeps only references that name a local pointer
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => (key === '$ref' && typeof child === 'string' ? [child] : refsIn(child)));
};

const resolves = (document: unknown, ref: string): boolean => at(document, ref) !== undefined;

const PERCENT = 100;

/** The JSON Schema dialect a contract's schemas are written in, for checking examples. */
const draftOf = (document: unknown): '2020-12' | 'openapi-3.0' => {
  const { openapi, swagger } = membersOf(document);
  return swagger !== undefined || (typeof openapi === 'string' && openapi.startsWith('3.0')) ? 'openapi-3.0' : '2020-12';
};

/** A schema with its references inlined, or `undefined` when one of them names nothing. */
const inlinedOf = (document: unknown, schema: unknown): ReturnType<typeof inline> | undefined => {
  // Stryker disable next-line BlockStatement: equivalent, an empty handler returns the same undefined
  try { return inline(document, schema); } catch { return undefined; }
};

/** Each `example` and `examples` item that its own schema refuses. */
const badExamples = (node: LintNode, document: unknown): string[] => {
  const { example, examples } = node.value;
  const samples = [...(example === undefined ? [] : [example]), ...(Array.isArray(examples) ? (examples as unknown[]) : [])];
  // Stryker disable next-line ConditionalExpression: equivalent, no sample gives no finding; this only skips the inlining
  if (samples.length === 0) return [];
  const inlined = inlinedOf(document, node.value);
  if (inlined === undefined) return [];
  // A schema that repeats or reaches another file cannot be checked on its own: said, never skipped.
  const unreadable = [...inlined.cycles, ...inlined.external];
  if (unreadable.length > 0) return [`example cannot be checked: its schema reaches ${unreadable.join(', ')}, which repeats or is in another file`];
  const schema = inlined.value;
  return samples.flatMap((sample) => {
    try {
      const problem = validAgainst(schema, sample, draftOf(document));
      return problem === undefined ? [] : [`example ${problem}`];
    } catch (error) {
      return [`example cannot be checked: ${(error as Error).message}`];
    }
  });
};

export const rules: Readonly<Record<string, Rule>> = {
  'operation-operation-id': {
    description: 'Every HTTP operation has an operationId: generated clients, tools and docs are named by it',
    given: { select: 'operation', formats: HTTP },
    then: { field: 'operationId', function: 'truthy' },
    fix: 'add an `operationId`, a verb and a noun in camelCase such as `listPets`',
  },
  'operation-operation-id-unique': {
    description: 'No two operations share an operationId',
    given: { select: 'document', formats: HTTP },
    check: (_node, { contract }) => {
      const ids = contract.operations.map((operation) => membersOf(at(contract.document, operation.source)).operationId).filter((id) => typeof id === 'string');
      return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].map((id) => `operationId \`${id}\` is used more than once`);
    },
    fix: 'give each operation its own `operationId`',
  },
  'operation-description': {
    description: 'Every operation says what it does, in a description or a summary',
    given: { select: 'operation' },
    check: (node) => (proseOf(node) === '' ? ['has no description or summary'] : []),
    fix: 'add a `description` saying what the operation does and when to call it',
  },
  'operation-tags': {
    description: 'Every HTTP operation has at least one tag: tags group docs and select tools',
    given: { select: 'operation', formats: HTTP },
    then: { field: 'tags', function: 'length', functionOptions: { min: 1 } },
    fix: 'add `tags` naming the resource the operation belongs to',
  },
  'operation-success-response': {
    description: 'Every HTTP operation declares a 2xx or 3xx response',
    given: { select: 'operation', formats: HTTP },
    check: (node) => (Object.keys(membersOf(node.value.responses)).some((code) => /^(?:[23]\d\d|[23]XX)$/u.test(code)) ? [] : ['declares no 2xx or 3xx response']),
    fix: 'declare the response a successful call returns',
  },
  'parameter-description': {
    description: 'Every parameter is described',
    given: { select: 'parameter' },
    then: { field: 'description', function: 'truthy' },
    fix: 'add a `description` saying what the parameter does and what values it takes',
  },
  'property-description': {
    description: 'Every property of every payload is described',
    given: { select: 'property' },
    then: { field: 'description', function: 'truthy' },
    fix: 'add a `description` saying what the property holds, with its unit if it has one',
  },
  'info-description': {
    description: 'The document says what the API is for',
    given: { select: 'document', formats: ['openapi', 'swagger2', 'asyncapi'] },
    then: { field: 'info.description', function: 'truthy' },
    fix: 'add `info.description`',
  },
  'no-unresolved-ref': {
    description: 'Every local `$ref` points at something the document defines',
    given: { select: 'document' },
    check: (node) => [...new Set(refsIn(node.value).filter((ref) => ref.startsWith('#') && !resolves(node.value, ref)))].map((ref) => `\`${ref}\` points at nothing`),
    fix: 'point the `$ref` at a definition that exists, or add the definition',
  },
  'no-unused-component': {
    description: 'Every schema under components is used',
    given: { select: 'document', formats: ['openapi'] },
    check: (node) => {
      const refs = refsIn(node.value);
      return Object.keys(membersOf(membersOf(node.value.components).schemas))
        .filter((name) => {
          const target = `#/components/schemas/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`;
          return !refs.some((ref) => ref === target || ref.startsWith(`${target}/`));
        })
        .map((name) => `\`components.schemas.${name}\` is never used`);
    },
    fix: 'remove the unused schema, or reference it where it is meant to be used',
  },
  'path-no-trailing-slash': {
    description: 'No path ends with a slash',
    given: { select: 'document', formats: HTTP },
    check: (node) => Object.keys(membersOf(node.value.paths)).filter((path) => path.length > 1 && path.endsWith('/')).map((path) => `path \`${path}\` ends with a slash`),
    fix: 'drop the trailing slash',
  },
  'example-valid': {
    description: 'Every example is valid against the schema it sits in',
    given: { select: 'schema' },
    check: (node, { contract }) => badExamples(node, contract.document),
    fix: 'correct the example, or the schema if the example is right',
  },
  'description-length': {
    description: `An operation's description fits in a tool list: at most ${String(MAX_DESCRIPTION)} characters`,
    given: { select: 'operation' },
    check: (node) => {
      const prose = proseOf(node);
      return prose.length > MAX_DESCRIPTION ? [`description has ${String(prose.length)} characters, more than ${String(MAX_DESCRIPTION)}`] : [];
    },
    fix: `say what the operation does and when to call it in ${String(MAX_DESCRIPTION)} characters; move the rest to the parameters' descriptions or the docs`,
  },
  'description-overlap': {
    description: `No two operations are described in words an agent cannot tell apart (${String(OVERLAP * PERCENT)}% shared or more)`,
    given: { select: 'operation' },
    check: (node, { contract }) => {
      const mine = wordsOf(proseOf(node));
      // The operations listed before this one; none when it is not one of them, never all but the last.
      const index = contract.operations.indexOf(node.operation as Operation);
      const earlier = contract.operations.filter((_, position) => position < index);
      return earlier.flatMap((other) => {
        const share = overlapOf(mine, wordsOf(proseOf({ pointer: other.source, value: membersOf(at(contract.document, other.source)) })));
        return share >= OVERLAP ? [`description shares ${String(Math.round(share * PERCENT))}% of its words with \`${other.id}\``] : [];
      });
    },
    fix: 'say in each description what makes the operation different: what it returns, what it changes, and when to call it instead of the other',
  },
};

/** The built-in rulesets: rule ids at their levels. */
export const rulesets: Readonly<Record<string, Readonly<Record<string, Level>>>> = {
  recommended: {
    'operation-operation-id': 'warn',
    'operation-operation-id-unique': 'warn',
    'operation-description': 'warn',
    'operation-tags': 'warn',
    'operation-success-response': 'warn',
    'parameter-description': 'warn',
    'info-description': 'warn',
    'no-unresolved-ref': 'warn',
    'no-unused-component': 'warn',
    'path-no-trailing-slash': 'warn',
    'example-valid': 'warn',
  },
  'agent-ready': {
    'operation-operation-id': 'warn',
    'operation-description': 'warn',
    'description-length': 'warn',
    'description-overlap': 'warn',
    'parameter-description': 'warn',
    'property-description': 'warn',
    'example-valid': 'warn',
  },
};
