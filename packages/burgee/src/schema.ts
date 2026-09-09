/**
 * `--schema` — the program as data (F1). It is the one command an agent runs first, so it
 * must succeed with no authentication, no config file and no network (N8): it reads the
 * manifest and nothing else. Choices are carried as data (N9), the same data that becomes
 * an MCP tool's input schema.
 */
import type { ArgumentSpec, CommandNode, Effects, Example, Manifest, OptionSpec } from './manifest.js';
import { kebab } from './names.js';

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
}

export interface CommandSchema {
  /** The command as typed, without the program name: `config get`. */
  name: string;
  description?: string;
  summary?: string;
  effects?: Effects;
  deprecated?: boolean | string;
  /** The heading it is listed under (M1). */
  group?: string;
  /** Its handler loads on dispatch (M2): this schema was complete without it. */
  lazy?: true;
  /** Which plugin contributed it (M3). */
  plugin?: string;
  arguments: ArgumentSpec[];
  options: Record<string, OptionSpec>;
  examples: Example[];
  /** The arguments and options as one JSON Schema object — what an MCP tool call takes. */
  inputSchema: JsonSchema;
}

export interface ProgramSchema {
  schemaVersion: 1;
  name: string;
  version?: string;
  description?: string;
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

export function commandSchemaOf(node: CommandNode, root: string[]): CommandSchema {
  const out: CommandSchema = {
    name: typedName(node, root),
    arguments: node.arguments ?? [],
    options: node.options,
    examples: node.examples ?? [],
    inputSchema: inputSchemaOf(node),
  };
  if (node.description !== undefined) out.description = node.description;
  if (node.summary !== undefined) out.summary = node.summary;
  if (node.effects !== undefined) out.effects = node.effects;
  if (node.deprecated !== undefined) out.deprecated = node.deprecated;
  if (node.group !== undefined) out.group = node.group;
  if (node.load !== undefined) out.lazy = true;
  if (node.plugin !== undefined) out.plugin = node.plugin;
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
  commands: { name: string; summary?: string; effects?: Effects }[];
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
  const out: ProgramSchema = { schemaVersion: 1, name: root.join(' '), commands: runnable(manifest).map((c) => commandSchemaOf(c, root)) };
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
