import { defineCommand, defineProgram, run } from '../../../../../packages/burgee/dist/index.js';
const commands = Array.from({ length: 1 }, (_, i) => defineCommand({
  name: i === 0 ? 'greet' : 'cmd' + i, description: 'Command number ' + i, effects: 'read_only',
  arguments: [{ name: 'name', description: 'who to greet', required: true }],
  options: { shout: { type: 'boolean', description: 'uppercase the greeting' }, times: { type: 'string', description: 'how many times' } },
  run: ({ options, positionals }) => { const line = 'Hello, ' + positionals[0] + '!'; return options.shout === true ? line.toUpperCase() : line; },
}));
await run(defineProgram({ name: 'demo', commands }));
