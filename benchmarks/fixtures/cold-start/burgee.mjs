import { defineCommand, defineProgram, run } from 'burgee';

await run(
  defineProgram({
    name: 'demo',
    commands: [
      defineCommand({
        name: 'greet',
        description: 'Greet someone',
        effects: 'read_only',
        arguments: [{ name: 'name', description: 'who to greet', required: true }],
        options: { shout: { type: 'boolean', description: 'uppercase the greeting' } },
        run: ({ options, positionals }) => {
          const line = `Hello, ${positionals[0]}!`;
          return options.shout === true ? line.toUpperCase() : line;
        },
      }),
    ],
  }),
);
