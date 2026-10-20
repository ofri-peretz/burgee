/**
 * default-command — the child of `node` that runs when argv names no command below it, if one
 * declares `default: true` (D-20261012-default-command-shape). `defineProgram` refuses two at one
 * level, so the first is the only one. A hidden default still runs: hiding is about listing.
 *
 * Its own module because three chunks read it and none of them is the engine's startup path:
 * dispatch (`surfaces.js`), help (`help.js`) and completions (`completions.js`).
 */
import { type CommandNode, type Manifest } from './manifest.js';

export const defaultOf = (manifest: Manifest, node: Pick<CommandNode, 'path'>): CommandNode | undefined =>
  manifest.commands.find((c) => c.default && c.path.slice(0, -1).join(' ') === node.path.join(' '));
