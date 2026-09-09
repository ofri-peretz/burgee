import yargs from "burgee/yargs";

yargs(process.argv.slice(2))
  .scriptName('demo')
  .command(
    'greet <name>',
    'Greet someone',
    (cmd) => cmd.positional('name', { type: 'string' }).option('shout', { type: 'boolean' }),
    (argv) => {
      const line = `Hello, ${argv.name}!`;
      process.stdout.write(`${argv.shout === true ? line.toUpperCase() : line}\n`);
    },
  )
  .parse();
