import { cac } from 'cac';

const cli = cac('demo');
cli.command('greet <name>', 'Greet someone')
  .option('--shout', 'uppercase the greeting')
  .action((name, options) => {
    const line = `Hello, ${name}!`;
    process.stdout.write(`${options.shout === true ? line.toUpperCase() : line}\n`);
  });
cli.parse();
