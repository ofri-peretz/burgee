/** Stub created by PLAN.md 6.0. Lane `ac-kit` replaces this file; see .sdlc/LANES.md. */
import { defineCommand } from 'burgee';

export const command = defineCommand({
  name: 'migrate',
  description: 'Switch from openapi-typescript, openapi-fetch, Hey API or orval: their config in, ours out',
  effects: 'idempotent',
  run: () => {
    throw new Error('`apicontract migrate` is not implemented yet. fix: it lands in Wave 6 (.sdlc/PLAN.md, lane ac-kit)');
  },
});
