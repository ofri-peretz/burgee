/** Breaks `deterministic` only: every run stamps a new number into a generated file. */
import { type Plugin } from '../../host.js';

import { files, generator, list } from './correct.js';

let runs = 0;

export const plugin: Plugin = {
  name: 'broken-deterministic',
  generators: {
    list: {
      ...generator,
      sample: { document: generator.sample.document, files: [...files, { path: 'stamp.txt', owner: 'generated', content: '1\n' }] },
      run: (contract) => {
        runs += 1;
        return [...list(contract), { path: 'stamp.txt', owner: 'generated', content: `${String(runs)}\n` }];
      },
    },
  },
};
