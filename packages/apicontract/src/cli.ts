/**
 * apicontract's commands, declared once so burgee projects each to `--json`, `--schema`, `--mcp`,
 * completions and `--skill`. Phase 0: every command is declared with its final name and effects
 * and fails with a `fix:` line naming the phase that delivers it (roadmap.md).
 */
import { defineCommand, defineProgram } from 'burgee';

export const VERSION = '0.0.0';

const planned = (name: string, description: string, phase: string) =>
  defineCommand({
    name,
    description,
    effects: 'read_only',
    run: () => {
      throw new Error(`\`apicontract ${name}\` is not implemented yet. fix: it lands in ${phase} (.sdlc/intents/apicontract/roadmap.md)`);
    },
  });

export const program = defineProgram({
  name: 'apicontract',
  version: VERSION,
  description: 'One contract tool for every API in a repo: what breaks and for whom, sized for agents',
  commands: [
    planned('diff', 'What a contract change breaks, and for whom, under the compatibility mode you pick', 'Phase 1'),
    planned('explain', 'One operation, message or tool, fully resolved and size-capped for an agent', 'Phase 1'),
    planned('gen', 'TypeScript types from a contract; the migration path off openapi-typescript', 'Phase 2'),
    planned('check', 'Call sites in the code that disagree with the contract, found statically', 'Phase 4'),
  ],
});
