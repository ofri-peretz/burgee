/** Breaks `paths` only: one file per operation, named by its id as it is, so `../x` leaves the folder. */
import { type Plugin } from '../../host.js';

import { document, generator } from './correct.js';

export const plugin: Plugin = {
  name: 'broken-paths',
  generators: {
    list: {
      ...generator,
      sample: { document, files: [{ path: 'listPets.txt', owner: 'generated', content: 'listPets\n' }] },
      run: (contract) => contract.operations.map((operation) => ({ path: `${operation.id}.txt`, owner: 'generated', content: `${operation.id}\n` })),
    },
  },
};
