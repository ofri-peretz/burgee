/**
 * burgee — a command declares itself once; every surface is that declaration
 * read by a different reader.
 *
 * The public entry, and only that. The execution core lives in execute.ts so a
 * façade can import it without pulling this barrel.
 *
 * ## What is not here, and why (D-093, reversed on a measurement)
 *
 * This barrel used to re-export the value half of `help.ts`, `mcp.ts`, `schema.ts`,
 * `plugin.ts`, `manifest.ts` and `seniority/precedence` as a convenience. A re-export is
 * not free: it makes those modules live for every consumer of `burgee`, whether or not
 * anything reads them. `execute.ts` loads each one behind an `await import()`, so the only
 * thing keeping them on the startup path was this file.
 *
 * Measured 2026-09-21 with `--splitting --outdir` over the transitive closure of `import`
 * statements — the initial load a consumer actually pays:
 *
 *   - `import { run } from 'burgee'` — **44,663 bytes**
 *   - the same program against `execute.ts` directly — **31,047 bytes**
 *   - cold start, `burgee ÷ cac` — **2.113 → 1.717**
 *
 * D-093 declined this split on a cold-start argument it did not have the number for. The
 * number says 13,616 bytes and 19% of startup, so the split lands: every value moved here
 * has a subpath of its own (`burgee/help`, `burgee/mcp`, `burgee/schema`, `burgee/plugin`,
 * `burgee/config`), which is where a program that wants it should say so.
 *
 * **Every `type` stays.** A type re-export is erased and costs a consumer nothing, so the
 * whole type surface is still importable from `burgee` and no typed program has to move.
 */
export { ExitCode, isExitCode, type ExitCode as ExitCodeValue } from './exit-code.js';
export {
  defineCommand,
  defineProgram,
  execute,
  resolveCommand,
  run,
  runCommand,
  sharedOptions,
  type AnyCommand,
  type Command,
  type CommandContext,
  type InferOptions,
  type OptionSpecs,
  type Program,
  type RunOptions,
  type RunResult,
} from './execute.js';
export { checkCommand, checkDefinition } from './definition.js';
export { AuthError, camel, kebab, UsageError } from './validate.js';
export { AGENT_PROBES, detectAgent, type AgentProbe, type Detection } from './agent.js';
export type { HelpOptions, HelpTheme, HelpToken } from './help.js';
export type { Invoke, ServeOptions, Tool, ToolAnnotations } from './mcp.js';
export type { Candidate, Layers, Provenance, Resolution, Source } from 'seniority/precedence';
export type { CommandSchema, JsonSchema, ProgramSchema, SchemaSummary } from './schema.js';
export type { PluginErrorCode } from './plugin.js';
export type {
  /** The class itself lives at `burgee/schema`; the *type* stays here so `defineProgram`'s return type is nameable. */
  Manifest,
  ArgumentSpec,
  CommandNode,
  Effects,
  Example,
  Hook,
  LazyModule,
  OptionSpec,
  ActionRequiredSpec,
  Plugin,
  Relation,
  RunContext,
  StandardResult,
  StandardSchemaV1,
} from './manifest.js';
