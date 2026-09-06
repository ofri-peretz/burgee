/**
 * The reference CLI on commander. Plain commander, on purpose: `commander-agent`
 * (intent 2) will layer the floor onto this exact program, and the conformance suite
 * measures the difference. Handlers write through the `Runtime` they are built
 * against, never `console`, so the harness sees everything.
 */
import { ExitCode, isExitCode, type Runtime } from '@interlace/cli-core';
import { Command, Option } from 'commander';

/** A tiny "config store" so `config get` has something to return. */
export const CONFIG = new Map<string, string>([
  ['user.name', 'ada'],
  ['greeting', 'Hello'],
]);

export function createProgram(rt: Runtime): Command {
  const program = new Command('demo').description('The Interlace CLI reference demo').version('0.0.0');

  program
    .command('greet')
    .description('Greet someone')
    .argument('<name>', 'who to greet')
    .option('--shout', 'uppercase the greeting')
    .addOption(new Option('--greeting <word>', 'the greeting word').env('DEMO_GREETING').default('Hello'))
    .action((name: string, options: { shout?: boolean; greeting: string }) => {
      const line = `${options.greeting}, ${name}!`;
      rt.stdout.write(`${options.shout ? line.toUpperCase() : line}\n`);
    });

  const config = program.command('config').description('Read configuration');
  config
    .command('get')
    .description('Print one configuration value')
    .argument('<key>', 'dotted key')
    .option('--json', 'print as JSON')
    .action((key: string, options: { json?: boolean }) => {
      const value = CONFIG.get(key);
      if (value === undefined) {
        rt.stderr.write(`unknown key: ${key}\n`);
        rt.exit(ExitCode.RUNTIME);
      }
      rt.stdout.write(options.json ? `${JSON.stringify({ key, value })}\n` : `${value}\n`);
    });

  program
    .command('fail')
    .description('Fail on purpose')
    .option('--code <n>', 'exit with this E1 code instead of throwing', (v) => Number(v))
    .action((options: { code?: number }) => {
      if (options.code !== undefined) {
        if (!isExitCode(options.code)) throw new Error(`not an E1 code: ${options.code}`);
        rt.exit(options.code);
      }
      throw new Error('boom');
    });

  return program;
}
