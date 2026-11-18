/** Stub created by PLAN.md 6.0. Lane `ac-diff` replaces this file; see .sdlc/LANES.md. */
import { defineCommand } from 'burgee';

export const command = defineCommand({
  name: 'diff',
  description: 'What a contract change breaks, and for whom, under the compatibility mode you pick',
  effects: 'read_only',
  run: () => {
    throw new Error('`apicontract diff` is not implemented yet. fix: it lands in Wave 6 (.sdlc/PLAN.md, lane ac-diff)');
  },
});
