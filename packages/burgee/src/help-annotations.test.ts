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
      },
      run: () => undefined,
    }),
  ],
});

const help = renderHelp(program, program.find(['app', 'send']) as never, { width: 120 });
const row = (flag: string): string => help.split('\n').find((l) => l.includes(flag)) ?? '';

describe('help annotations (R4)', () => {
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
