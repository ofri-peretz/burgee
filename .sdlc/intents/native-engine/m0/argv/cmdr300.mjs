import { Command } from '../../../../../node_modules/commander/index.js';
const program = new Command().name('demo');
for (let i = 0; i < 300; i++) program.command((i === 0 ? 'greet' : 'cmd' + i) + ' <name>').description('Command number ' + i).option('--shout', 'uppercase the greeting').option('--times <n>', 'how many times').action((name, o) => process.stdout.write('Hello, ' + name + '!\n'));
program.parse(process.argv);
