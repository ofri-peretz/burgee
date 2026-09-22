#!/usr/bin/env node
/**
 * roundel's command line, and the only file in the package that owns the process.
 *
 * Ten lines on purpose. Everything `check` does is in `check.ts`, which takes argv and a writer
 * and returns a code, so it is tested without spawning. This file hands it the real three.
 */
import { check, EXIT_RUNTIME } from './check.js';

const [, , command, ...rest] = process.argv;
check(command === 'check' ? rest : [command, ...rest].filter((a): a is string => a !== undefined), (s) => void process.stdout.write(s)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = EXIT_RUNTIME;
  },
);
