/** Breaks `regeneration` only: a user-owned file lists the operations, so a spec change would rewrite it. */
import { type Plugin } from '../../host.js';

import { document, generator, listing } from './correct.js';

export const plugin: Plugin = {
  name: 'broken-regeneration',
  generators: {
    list: {
      ...generator,
      sample: { document, files: [{ path: 'handlers.txt', owner: 'user', content: 'listPets\n' }] },
      run: (contract) => [{ path: 'handlers.txt', owner: 'user', content: listing(contract) }],
    },
  },
};
