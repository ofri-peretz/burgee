import { program } from '../../shim.js';

program
  .command('clear', 'clear the cache')
  .command('validate', 'validate the cache', { isDefault: true })
  .parse(process.argv);
