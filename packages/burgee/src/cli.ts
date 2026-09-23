/**
 * `burgee` — the package's own command line; the commands live in `program.ts`.
 *
 * This module runs the program when it is loaded, which is what a bin is for — and why
 * nothing else imports it. A test that imported `program` from here ran the real CLI
 * against vitest's argv, which exited the worker with 2 part-way through the suite
 * (`option-key-canonical.test.ts`, 2026-09-23). `program-import-lock.test.ts` holds it.
 */
import { run } from './execute.js';
import { program } from './program.js';

run(program);

export * from './program.js';
