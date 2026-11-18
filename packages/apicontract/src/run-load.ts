/**
 * The plugins a run uses (apicontract-gen-command R2, spec.md R-EX7): the built-in formats and
 * plugins first, then each entry of the config's `plugins`, in order, so a later one wins a name.
 * Nothing is found by scanning `node_modules`: a plugin runs code in CI, so the repository names
 * every one it trusts. One that does not load, or is not a plugin, stops the run.
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createHost, type Host } from './host.js';
import { builtinAdapters } from './inputs.js';
import { builtins } from './plugins.js';
import { ConfigError } from './run-config.js';

/** Where a `plugins` entry is imported from: a relative path from the config's folder, or a package resolved from there. */
export const locate = (entry: string, root: string): string =>
  entry.startsWith('.') || entry.startsWith('/') ? pathToFileURL(resolve(root, entry)).href : pathToFileURL(createRequire(join(root, 'package.json')).resolve(entry)).href;

/** What a module exports as its plugin: its default export, else an export named `plugin`. */
const pluginOf = (module: Record<string, unknown>): unknown => module.default ?? module.plugin;

export interface LoadOptions {
  /** The folder the config is in. */
  readonly root: string;
  /** The config file, for the refusal. */
  readonly file: string;
  readonly plugins: readonly string[];
}

/** A host with the built-ins and every configured plugin registered. */
export const loadPlugins = async ({ root, file, plugins }: LoadOptions): Promise<Host> => {
  const host = createHost();
  for (const plugin of [{ name: 'apicontract', adapters: builtinAdapters }, ...builtins]) host.register(plugin);
  // Imported together, registered in the config's order: a later plugin wins a name.
  const modules = await Promise.all(
    plugins.map(async (entry) => {
      try {
        // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- R-EX7: only what the project's config names in `plugins` is loaded
        return (await import(locate(entry, root))) as Record<string, unknown>;
      } catch (error) {
        throw new ConfigError(file, [`the plugin "${entry}" did not load (${(error as Error).message}). fix: install it (\`npm i -D ${entry}\`) or correct its path in \`plugins\``]);
      }
    }),
  );
  for (const [index, entry] of plugins.entries()) {
    const module = modules[index] as Record<string, unknown>;
    try {
      host.register(pluginOf(module));
    } catch (error) {
      // `register` refuses only with a PluginError, whose message carries its fix.
      throw new ConfigError(file, [`"${entry}" is not a plugin apicontract can use: ${(error as Error).message}`]);
    }
  }
  return host;
};
