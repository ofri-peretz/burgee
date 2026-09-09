import { Command } from 'commander';

const program = new Command();
program
  .name('demo')
  .command('greet <name>')
  .option('--shout', 'uppercase the greeting')
  .action((name, options) => {
    const line = `Hello, ${name}!`;
    process.stdout.write(`${options.shout === true ? line.toUpperCase() : line}\n`);
  });
program.parse(process.argv);
