/**
 * The reference CLI on burgee's own syntax — the same program as the commander and
 * yargs demos, so one conformance suite runs on all three hosts (G2). Handlers return
 * data; the engine renders it as text or as the `--json` envelope.
 */
import { defineCommand, defineProgram, isExitCode } from 'burgee';

/** A tiny "config store" so `config get` has something to return. */
export const CONFIG = new Map<string, string>([
  ['user.name', 'ada'],
  ['greeting', 'Hello'],
]);

export const program = defineProgram({
  name: 'demo',
  description: 'The burgee reference demo',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'Greet someone',
      effects: 'read_only',
      arguments: [{ name: 'name', description: 'who to greet', required: true }],
      examples: [{ command: 'demo greet ada --shout', description: 'greet ada, loudly' }],
      // clispec-conformance R8 — one value, a string: what `--schema` publishes as `cardinality`
      // and `stdout_schema`, and what TypeScript holds the handler to.
      output: { cardinality: 'single', schema: { type: 'string' } },
      options: {
        shout: { type: 'boolean', description: 'uppercase the greeting' },
        greeting: { type: 'string', description: 'the greeting word', env: 'DEMO_GREETING', default: 'Hello' },
      },
      run: ({ options, positionals }) => {
        const [name] = positionals;
        const line = `${String(options['greeting'])}, ${name ?? ''}!`;
        return options['shout'] === true ? line.toUpperCase() : line;
      },
    }),
    defineCommand({
      name: 'config',
      description: 'Read configuration',
      commands: [
        defineCommand({
          name: 'get',
          description: 'Print one configuration value',
          effects: 'read_only',
          arguments: [{ name: 'key', description: 'dotted key', required: true }],
          examples: [{ command: 'demo config get user.name --json', description: 'one value, as the --json envelope' }],
          output: { cardinality: 'single', schema: { type: 'string' } },
          run: ({ positionals }) => {
            const [key = ''] = positionals;
            const value = CONFIG.get(key);
            if (value === undefined) throw new Error(`unknown key: ${key}`);
            return value;
          },
        }),
      ],
    }),
    defineCommand({
      name: 'fail',
      description: 'Fail on purpose',
      effects: 'idempotent',
      options: { code: { type: 'string', description: 'exit with this E1 code instead of throwing' } },
      examples: [{ command: 'demo fail --code 3', description: 'leave with exit 3, CONFIG, and print nothing' }],
      // It never returns: `not: {}` is the JSON Schema no value satisfies.
      output: { cardinality: 'single', schema: { not: {} } },
      run: ({ options, exit }) => {
        if (options['code'] !== undefined) {
          const code = Number(options['code']);
          if (!isExitCode(code)) throw new Error(`not an E1 code: ${String(options['code'])}`);
          exit(code);
        }
        throw new Error('boom');
      },
    }),
  ],
});
