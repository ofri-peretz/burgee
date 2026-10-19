/**
 * Help's trailing annotations (R4) for the declarations help.test.ts's fixture does not make:
 * a required option, a repeatable one, a number's placeholder, and an option with no
 * description, which still gets its annotations rather than an empty row.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './execute.js';
import { renderHelp } from './help.js';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'send',
      effects: 'read_only',
      options: {
        to: { type: 'string', required: true, description: 'recipient' },
        tag: { type: 'string', multiple: true, description: 'label it' },
        retries: { type: 'number', description: 'how many times' },
        port: { type: 'number', placeholder: 'port' },
        quiet: { type: 'boolean', default: false },
        replicas: { type: 'number', minimum: 1, maximum: 20, default: 2, description: 'how many' },
        floor: { type: 'number', minimum: 0 },
        ceiling: { type: 'number', maximum: 9.5, integer: false },
      },
      run: () => undefined,
    }),
  ],
});

const help = renderHelp(program, program.find(['app', 'send']) as never, { width: 120 });
const row = (flag: string): string => help.split('\n').find((l) => l.includes(flag)) ?? '';

describe('help annotations (R4)', () => {
  /**
   * cli-help-renderer S1, the `min` / `max` row (oclif #1001): the bounds `--schema` publishes
   * and the parser enforces are on the option's own line, after the default, in the schema's
   * words. Red first: `annotate()` rendered neither, so the rows ended at `(default: 2)`, at the
   * placeholder, and at the placeholder.
   */
  it('shows minimum and maximum, after the default, each on its own', () => {
    expect(row('--replicas')).toMatch(/--replicas <n> +how many \(default: 2\) \(minimum: 1\) \(maximum: 20\)$/);
    expect(row('--floor')).toMatch(/--floor <n> +\(minimum: 0\)$/);
    expect(row('--ceiling')).toMatch(/--ceiling <n> +\(maximum: 9\.5\)$/);
  });
  it('marks a required option', () => {
    expect(row('--to')).toMatch(/--to <value> +recipient \(required\)$/);
  });
  it('marks a repeatable option', () => {
    expect(row('--tag')).toMatch(/--tag <value> +label it \(repeatable\)$/);
  });
  it('names a number’s value n, unless the option names it', () => {
    expect(row('--retries')).toMatch(/--retries <n> +how many times$/);
    expect(row('--port')).toMatch(/--port <port>$/);
  });
  it('annotates an option with no description', () => {
    expect(row('--quiet')).toMatch(/--quiet +\(default: false\)$/);
  });
});
