/** The reference CLI on real commander. See `program.ts`; `burgee.ts` is the same program on `burgee/commander`. */
import { type Runtime } from 'burgee/testing';
import { Command, Option } from 'commander';

import { buildProgram } from './program.js';


export function createProgram(rt: Runtime): Command {
  return buildProgram({ Command, Option }, rt);
}

export { CONFIG } from './program.js';
