/**
 * The reference CLI on yargs: the same three commands as `demo-cli-commander`, in
 * yargs' idiom, so the conformance suite is the contract between the two hosts.
 */
import { ExitCode, isExitCode, type Runtime } from '@interlace/cli-core';
import { type Argv } from 'yargs';

export const CONFIG = new Map<string, string>([
  ['user.name', 'ada'],
  ['greeting', 'Hello'],
]);

export function buildCli(y: Argv, rt: Runtime): Argv {
  return y
    .scriptName('demo')
    .version('0.0.0')
    .env('DEMO')
    .strict()
    .demandCommand(1)
    .command(
      'greet <name>',
      'Greet someone',
      (cmd) =>
        cmd
          .positional('name', { type: 'string', demandOption: true, describe: 'who to greet' })
          .option('shout', { type: 'boolean', describe: 'uppercase the greeting' })
          .option('greeting', { type: 'string', default: 'Hello', describe: 'the greeting word' }),
      (argv) => {
        const line = `${argv.greeting}, ${argv.name}!`;
        rt.stdout.write(`${argv.shout ? line.toUpperCase() : line}\n`);
      },
    )
    .command('config', 'Read configuration', (cmd) =>
      cmd.demandCommand(1).command(
        'get <key>',
        'Print one configuration value',
        (c) => c.positional('key', { type: 'string', demandOption: true, describe: 'dotted key' }).option('json', { type: 'boolean', describe: 'print as JSON' }),
        (argv) => {
          const value = CONFIG.get(argv.key);
          if (value === undefined) {
            rt.stderr.write(`unknown key: ${argv.key}\n`);
            rt.exit(ExitCode.RUNTIME);
          }
          rt.stdout.write(argv.json ? `${JSON.stringify({ key: argv.key, value })}\n` : `${value}\n`);
        },
      ),
    )
    .command(
      'fail',
      'Fail on purpose',
      (cmd) => cmd.option('code', { type: 'number', describe: 'exit with this E1 code instead of throwing' }),
      (argv) => {
        if (argv.code !== undefined) {
          if (!isExitCode(argv.code)) throw new Error(`not an E1 code: ${argv.code}`);
          rt.exit(argv.code);
        }
        throw new Error('boom');
      },
    );
}
