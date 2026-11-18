/** Breaks `fix-lines` only: it refuses a contract with no operations without saying what to do. */
import { type Plugin } from '../../host.js';

import { generator, list } from './correct.js';

export const plugin: Plugin = {
  name: 'broken-fix-lines',
  generators: {
    list: {
      ...generator,
      run: (contract) => {
        if (contract.operations.length === 0) throw new Error('there is nothing to list');
        return list(contract);
      },
    },
  },
};
