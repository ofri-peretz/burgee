/** Breaks `schema` only: the generator does not say which input formats it reads. */
import { generator } from './correct.js';

export const plugin = { name: 'broken-schema', generators: { list: { ...generator, inputs: [] } } };
