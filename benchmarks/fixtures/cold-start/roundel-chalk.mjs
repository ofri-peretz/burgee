// roundel R8: the chalk drop-in against picocolors' spawn. `roundel/chalk` detects the terminal
// at import, as chalk does, so this row carries that detection too.
import chalk from 'roundel/chalk';

process.stdout.write(`${chalk.red('Hello, ada!')}\n`);
