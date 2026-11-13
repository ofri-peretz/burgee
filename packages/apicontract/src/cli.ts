/**
 * apicontract's commands, declared once so burgee projects each to `--json`, `--schema`, `--mcp`,
 * completions and `--skill`. Phase 0: every command is declared with its final name and effects
 * and fails with a `fix:` line naming the phase that delivers it (roadmap.md). `gen` and
 * `extract` come first because they are the product: spec to code, and code to spec.
 */
import { defineCommand, defineProgram, type Effects } from 'burgee';

export const VERSION = '0.0.0';

const planned = (name: string, description: string, phase: string, effects: Effects = 'read_only') =>
  defineCommand({
    name,
    description,
    effects,
    run: () => {
      throw new Error(`\`apicontract ${name}\` is not implemented yet. fix: it lands in ${phase} (.sdlc/intents/apicontract/roadmap.md)`);
    },
  });

export const program = defineProgram({
  name: 'apicontract',
  version: VERSION,
  description: 'Turn your specs into code and your code into specs, through plugins',
  commands: [
    // The two that write files. The same input writes the same output, so a rerun is safe.
    planned('gen', 'Code from a spec, one plugin per target: TypeScript types, validators, NestJS modules', 'Phase 1', 'idempotent'),
    planned('extract', 'A spec from your code, one plugin per source: validator schemas, NestJS, Hono', 'Phase 2', 'idempotent'),
    planned('explain', 'One operation, message or tool, fully resolved and size-capped for an agent', 'Phase 5'),
    planned('diff', 'What a contract change breaks, and for whom, under the compatibility mode you pick', 'Phase 5'),
    planned('check', 'Call sites in the code that disagree with the contract, found statically', 'Phase 7'),
  ],
});
