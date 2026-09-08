/**
 * burgee — a command declares itself once; every surface is that declaration
 * read by a different reader.
 *
 * The public entry, and only that. The execution core lives in execute.ts so a
 * façade can import it without pulling this barrel.
 */
export { ExitCode, isExitCode, type ExitCode as ExitCodeValue } from './exit-code.js';
export {
  defineCommand,
  defineProgram,
  execute,
  run,
  type AnyCommand,
  type Command,
  type CommandContext,
  type InferOptions,
  type OptionSpecs,
  type Program,
  type RunOptions,
} from './execute.js';
export { camel, checkDefinition, kebab, UsageError } from './validate.js';
export { renderHelp, type HelpOptions } from './help.js';
export { annotationsOf, MCP_PROTOCOL_VERSION, serveMcp, toolsOf, type Invoke, type ServeOptions, type Tool, type ToolAnnotations } from './mcp.js';
export { ConfigError, envName, explain, resolve, screaming, type Candidate, type Layers, type Provenance, type Resolution, type Source } from './precedence.js';
export { commandSchemaOf, inputSchemaOf, schemaOf, type CommandSchema, type JsonSchema, type ProgramSchema } from './schema.js';
export {
  definePlugin,
  Manifest,
  type ArgumentSpec,
  type CommandNode,
  type Effects,
  type Example,
  type Hook,
  type OptionSpec,
  type Plugin,
  type Relation,
  type RunContext,
  type StandardResult,
  type StandardSchemaV1,
} from './manifest.js';
