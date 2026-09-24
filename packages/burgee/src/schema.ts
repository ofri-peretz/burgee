import { ExitCode } from './exit-code.js';
/**
 * `--schema` — the program as data (F1). It is the one command an agent runs first, so it
 * must succeed with no authentication, no config file and no network (N8): it reads the
 * manifest and nothing else. Choices are carried as data (N9), the same data that becomes
 * an MCP tool's input schema.
 */
import { type ArgumentSpec, type CommandNode, type DeclaredEffects, type Example, type Manifest, type OptionSpec, type Relation, relationsOf } from './manifest.js';
import { flagsOf, kebab } from './names.js';

export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: false;
}

export interface JsonSchemaProperty {
  type: 'string' | 'boolean' | 'number' | 'integer' | 'array';
  description?: string;
  enum?: string[];
  default?: string | boolean | number | readonly (string | number)[];
  items?: { type: 'string' | 'boolean' | 'number' | 'integer'; enum?: string[] };
  minimum?: number;
  maximum?: number;
  /** The command-line spelling of the option (S5). */
  flag?: string;
  /** The shared set this option was copied from (M4). */
  sharedFrom?: string;
  /**
   * The flags this option requires, and the flags it excludes — as the caller types them, not
   * as the handler reads them, because the reader of this document is composing a command line
   * (S5). Both are also in the command's `relations`; here they are on the property an agent is
   * already looking at, which is the difference between reading a constraint and finding one.
   *
   * Omitted when the option declares none, so absent reads as "no constraint" rather than
   * "constraints not published" — the rule `relations` follows one level up.
   */
  dependsOn?: string[];
  exclusive?: string[];
}

export interface CommandSchema {
  /** The command as typed, without the program name: `config get`. */
  name: string;
  description?: string;
  summary?: string;
  /**
   * What running it does, or `'withheld'` — published either way, because an agent reading
   * the program as data is better served by *this exists and is not for you* than by a gap
   * it cannot tell from a command that does not exist (N6).
   */
  effects?: DeclaredEffects;
  /** What `--json=` selects from (N14), when the command declares it. */
  fields?: readonly string[];
  deprecated?: boolean | string;
  /** The heading it is listed under (M1). */
  group?: string;
  /** Its handler loads on dispatch (M2): this schema was complete without it. */
  lazy?: true;
  /** Which plugin contributed it (M3). */
  plugin?: string;
  arguments: ArgumentSpec[];
  options: Record<string, OptionSpec>;
  /**
   * The constraints between options (S2/S6), which `validate.ts` already enforces and the
   * schema did not publish. Without them an agent can only discover that `--a` conflicts
   * with `--b` by sending both and reading exit 2 — a round trip per constraint, and under
   * E1 an exit 2 means *rewrite the command*, so it may well send the same pair again.
   *
   * Omitted entirely when a command declares none, so a reader can tell "no constraints"
   * from "constraints not published".
   */
  relations?: PublishedRelation[];
  examples: Example[];
  /** The arguments and options as one JSON Schema object — what an MCP tool call takes. */
  inputSchema: JsonSchema;
}

/**
 * A relation as JSON can carry it.
 *
 * `implies` takes either another option's name or a **predicate over the values**, and a
 * function cannot be published. `JSON.stringify` turns it into `null` without a word, which
 * would hand an agent `["force", null]` and let it conclude the constraint is malformed
 * rather than unevaluable. So a predicate becomes the string `"(predicate)"`: the pair is
 * still visible, and what is missing says so.
 */
export type PublishedRelation =
  | { exactlyOneOf: readonly string[] }
  | { atLeastOneOf: readonly string[] }
  | { atMostOneOf: readonly string[] }
  | { conflicts: readonly string[] }
  | { implies: readonly [string, string] };

/** The marker a predicate leaves behind. Not a name any option can have — it has parentheses. */
export const PREDICATE = '(predicate)';

function publishable(relation: Relation): PublishedRelation {
  if (!('implies' in relation)) return relation;
  const [option, consequent] = relation.implies;
  return { implies: [option, typeof consequent === 'function' ? PREDICATE : consequent] };
}

export interface ProgramSchema {
  schemaVersion: 1;
  name: string;
  version?: string;
  description?: string;
  /**
   * F1 — what each exit code means, so an agent branches on the number without reading prose:
   * the contract's seven, the same table `ExitCode` exports.
   */
  exitCodes: Readonly<Record<string, number>>;
  commands: CommandSchema[];
}

/** Positionals go under their own names; a variadic one is an array. */
function argumentProperty(a: ArgumentSpec): JsonSchemaProperty {
  const p: JsonSchemaProperty = a.variadic === true ? { type: 'array', items: { type: 'string' } } : { type: 'string' };
  if (a.description !== undefined) p.description = a.description;
  if (a.default !== undefined) p.default = a.default;
  return p;
}

function scalarType(spec: OptionSpec): 'string' | 'boolean' | 'number' | 'integer' {
  if (spec.type === 'number') return spec.integer === true ? 'integer' : 'number';
  return spec.type;
}

function optionProperty(name: string, spec: OptionSpec): JsonSchemaProperty {
  const scalar = scalarType(spec);
  const p: JsonSchemaProperty = spec.multiple === true ? { type: 'array', items: { type: scalar } } : { type: scalar };
  p.flag = `--${kebab(name)}`;
  if (spec.description !== undefined) p.description = spec.description;
  if (spec.choices !== undefined) {
    if (p.items !== undefined) p.items.enum = [...spec.choices];
    else p.enum = [...spec.choices];
  }
  if (spec.default !== undefined) p.default = spec.default;
  if (spec.minimum !== undefined) p.minimum = spec.minimum;
  if (spec.maximum !== undefined) p.maximum = spec.maximum;
  if (spec.sharedFrom !== undefined) p.sharedFrom = spec.sharedFrom;
  if (spec.dependsOn !== undefined && spec.dependsOn.length > 0) p.dependsOn = flagsOf(spec.dependsOn);
  if (spec.exclusive !== undefined && spec.exclusive.length > 0) p.exclusive = flagsOf(spec.exclusive);
  return p;
}

export function inputSchemaOf(node: CommandNode): JsonSchema {
  const properties = new Map<string, JsonSchemaProperty>();
  const required: string[] = [];
  for (const a of node.arguments ?? []) {
    properties.set(a.name, argumentProperty(a));
    if (a.required !== false) required.push(a.name);
  }
  for (const [name, spec] of Object.entries(node.options)) {
    if (spec.hidden === true) continue;
    properties.set(name, optionProperty(name, spec));
    if (spec.required === true && spec.default === undefined) required.push(name);
  }
  return { type: 'object', properties: Object.fromEntries(properties), required, additionalProperties: false };
}

/** The typed name of a node: its path without the program's own name. */
export function typedName(node: CommandNode, root: string[]): string {
  return node.path.slice(root.length).join(' ');
}

/** Keys a command's schema publishes exactly as the node holds them, in the order they appear. */
const PASSED_THROUGH = ['description', 'summary', 'effects', 'fields', 'deprecated', 'group'] as const;

export function commandSchemaOf(node: CommandNode, root: string[]): CommandSchema {
  const out: CommandSchema = {
    name: typedName(node, root),
    arguments: node.arguments ?? [],
    options: node.options,
    examples: node.examples ?? [],
    inputSchema: inputSchemaOf(node),
  };
  // One loop over the copied-as-is keys, in published order: six `if` lines cost the façade
  // bundle more than N14's `fields` could be allowed to add (the B4 ratchet, 59,450 B).
  for (const key of PASSED_THROUGH) if (node[key] !== undefined) Object.assign(out, { [key]: node[key] });
  if (node.load !== undefined) out.lazy = true;
  if (node.plugin !== undefined) out.plugin = node.plugin;
  // Both spellings, in one list, through the one function the engine enforces (S2/S6).
  const relations = relationsOf(node);
  if (relations.length > 0) out.relations = relations.map(publishable);
  return out;
}

/** Every runnable, visible command, in declaration order. Groups are structure, not commands. */
export function runnable(manifest: Manifest): CommandNode[] {
  return manifest.commands.filter((c) => c.run !== undefined && c.hidden !== true);
}

export interface SchemaSummary {
  schemaVersion: 1;
  name: string;
  version?: string;
  description?: string;
  /** The full schema exceeded the budget; this lists every command and how to get one in full. */
  summarised: true;
  budget: number;
  commands: { name: string; summary?: string; effects?: DeclaredEffects }[];
  hint: string;
}

/** Above the budget (N13): every command by name and summary, and the drilling command for one in full. */
export function summaryOf(manifest: Manifest, budget: number): SchemaSummary {
  const root = manifest.rootPath;
  const program = manifest.find(root);
  const out: SchemaSummary = {
    schemaVersion: 1,
    name: root.join(' '),
    summarised: true,
    budget,
    commands: runnable(manifest).map((c) => ({
      name: typedName(c, root),
      ...(c.summary ?? c.description === undefined ? {} : { summary: c.summary ?? c.description ?? '' }),
      ...(c.effects === undefined ? {} : { effects: c.effects }),
    })),
    hint: `run \`${root.join(' ')} <command> --schema\` for one command in full`,
  };
  if (manifest.version !== undefined) out.version = manifest.version;
  const description = program?.description;
  if (description !== undefined) out.description = description;
  return out;
}

export function schemaOf(manifest: Manifest): ProgramSchema {
  const root = manifest.rootPath;
  const program = manifest.find(root);
  const out: ProgramSchema = { schemaVersion: 1, name: root.join(' '), exitCodes: ExitCode, commands: runnable(manifest).map((c) => commandSchemaOf(c, root)) };
  if (manifest.version !== undefined) out.version = manifest.version;
  const description = program?.description;
  if (description !== undefined) out.description = description;
  return out;
}

/**
 * R1 — a machine format is compact. `--schema`'s reader is a program, and indentation was
 * 42% of what it was being sent: 39,512 B for the large reference demo, 22,964 B once the
 * whitespace goes, for a byte-identical parse. `--format=json-pretty` is the escape hatch,
 * because the person debugging a schema is real even though the schema's reader is not.
 *
 * It also makes `execute.ts`'s `SCHEMA_BUDGET` honest: that budget has always been measured
 * against `JSON.stringify(full).length` — the *compact* length — while the stream got the
 * pretty one, so a document that passed a 48,000-character budget could arrive at 68,000.
 *
 * Here rather than in a module of its own because both `execute.ts` and the commander
 * front-end need it and both already reach this file; a new module cost 215 dist bytes
 * against a `.` entry budget with 79 to spare, which is a lot of ratchet for two lines.
 */
const JSON_PRETTY = '--format=json-pretty';
const INDENT = 2;

/** The machine document, compact unless a person asked for the readable one. */
export const machineJson = (value: unknown, head: readonly string[]): string => JSON.stringify(value, null, head.includes(JSON_PRETTY) ? INDENT : 0);
