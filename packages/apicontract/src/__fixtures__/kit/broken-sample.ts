/** Breaks `sample` only: the sample declares bytes `run` does not return. */
import { type Plugin } from '../../host.js';

import { document, files, generator } from './correct.js';

export const plugin: Plugin = {
  name: 'broken-sample',
  generators: { list: { ...generator, sample: { document, files: files.map((file) => (file.owner === 'generated' ? { ...file, content: 'getPets\n' } : file)) } } },
};
