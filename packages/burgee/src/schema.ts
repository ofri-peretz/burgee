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
}

export interface CommandSchema {
  /** The command as typed, without the program name: `config get`. */
  name: string;
  description?: string;
  summary?: string;
  effects?: Effects;
  deprecated?: boolean | string;
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
  return out;
}

/** Every runnable, visible command, in declaration order. Groups are structure, not commands. */
export function runnable(manifest: Manifest): CommandNode[] {
  return manifest.commands.filter((c) => c.run !== undefined && c.hidden !== true);
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
