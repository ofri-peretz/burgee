/** Stub created by PLAN.md 6.0. Lane `ac-kit` replaces this file; see .sdlc/LANES.md. */
import { defineCommand } from 'burgee';

export const command = defineCommand({
  name: 'plugin',
  description: 'Scaffold a plugin that passes the conformance suite as generated',
  effects: 'idempotent',
  run: () => {
    throw new Error('`apicontract plugin` is not implemented yet. fix: it lands in Wave 6 (.sdlc/PLAN.md, lane ac-kit)');
  },
});
