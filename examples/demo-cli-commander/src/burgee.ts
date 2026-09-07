/**
 * The reference CLI on `burgee/commander`: `program.ts` unchanged, one import swapped.
 * The cast below is the drop-in claim stated as a type; the conformance suite
 * (`commander-parity.test.ts`) is what proves it, byte for byte.
 */
import { Command, Option } from 'burgee/commander';
import { type Runtime } from 'burgee/testing';
import { type Command as CommanderCommand } from 'commander';

import { buildProgram, type CommanderLike } from './program.js';

export function createProgramOnBurgee(rt: Runtime): CommanderCommand {
  return buildProgram({ Command, Option } as unknown as CommanderLike, rt);
}
