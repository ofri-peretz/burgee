/**
 * apicontract's commands, declared once so burgee projects each to `--json`, `--schema`, `--mcp`,
 * completions and `--skill`. Phase 0: every command is declared with its final name and effects
 * and fails with a `fix:` line naming the phase that delivers it (roadmap.md), until it lands. `gen`
 * and `extract` come first because they are the product: spec to code, and code to spec.
 */
import { defineCommand, defineProgram, type Effects } from 'burgee';

import { commands } from './commands.js';
import { extractCommand, genCommand } from './run-command.js';

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
    // The two that write files (run-command.ts). The same input writes the same output, so a rerun is safe.
    genCommand,
    extractCommand,
    // One `command-<name>.ts` per command, each owned by its lane (.sdlc/LANES.md).
    ...commands,
    planned('check', 'Call sites in the code that disagree with the contract, found statically', 'Phase 7'),
  ],
});
