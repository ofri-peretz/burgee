/** Stub created by PLAN.md 6.0. Lane `ac-agents` replaces this file; see .sdlc/LANES.md. */
import { defineCommand } from 'burgee';

export const command = defineCommand({
  name: 'explain',
  description: 'One operation, message or tool, fully resolved and size-capped for an agent',
  effects: 'read_only',
  run: () => {
    throw new Error('`apicontract explain` is not implemented yet. fix: it lands in Wave 6 (.sdlc/PLAN.md, lane ac-agents)');
  },
});
