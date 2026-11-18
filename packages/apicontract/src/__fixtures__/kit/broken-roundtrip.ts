/** Breaks `roundtrip` only: the plugin is the correct one, and its extractor loses every operation. */
import { extractor as reader, plugin as correct } from './correct.js';

export const plugin = { ...correct, name: 'broken-roundtrip' };

export const extractor = { ...reader, run: () => ({ openapi: '3.1.0', paths: {} }) };
