/**
 * yargs 17's factory, for `burgee/yargs/v17` (`previous-majors` R3): `burgee/yargs`'s, with 17's
 * behaviour in the three places yargs 17.7.3's own suite finds that 18 changed it. Nothing here
 * is reached from `burgee/yargs`, so a program on 18 bundles none of it.
 *
 * - **The locale is the string table's, not reset per instance.** 18's constructor sets
 *   `en_US` on every instance it builds; 17's leaves the table as it is, `en` until a program or
 *   a detection says otherwise.
 * - **`commandDir()` is `require-directory`'s walk.** Depth first, a directory's commands
 *   before the files beside it; `include` and `exclude` see the whole path; `visit` is handed
 *   the module itself, where 18 hands a copy with no prototype.
 * - **A command module without `command` is named after its file**, found in the CommonJS
 *   module cache by its exports (17's `whichModule`). Only the `require()` entry has that cache
 *   to search, as only 17's CommonJS build did.
 */
import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type CommandHandlerDefinition, CommandInstance, isCommandHandlerDefinition } from './command.js';
import { YargsFactory } from './factory.js';
import { shim } from './shim.js';
import { y18n } from './y18n.js';

/** The package's `locales/`, two directories up from `src/yargs/` and from `dist/yargs/` alike. */
const LOCALES = fileURLToPath(new URL('../../locales', import.meta.url));

type Visit = (module: unknown, path: string, filename: string) => unknown;

interface DirOptions {
  recurse?: boolean;
  extensions?: string[];
  visit?: Visit;
  include?: RegExp | ((path: string, filename: string) => boolean);
  exclude?: RegExp | ((path: string, filename: string) => boolean);
}

/** `require-directory`'s file test: the extension, then `include` and `exclude` against the path. */
function included(path: string, filename: string, { extensions = ['js'], include, exclude }: DirOptions): boolean {
  if (!new RegExp(`\\.(${extensions.join('|')})$`, 'i').test(filename)) return false;
  if (include !== undefined && !(include instanceof RegExp ? include.test(path) : include(path, filename))) return false;
  return exclude === undefined || !(exclude instanceof RegExp ? exclude.test(path) : exclude(path, filename));
}

/** Whether a command module names its own command, as a string or a list. */
const isNamed = (cmd: CommandHandlerDefinition): boolean => Array.isArray(cmd.command) || typeof cmd.command === 'string';

/** `cmd` named after `file` when it names no command: a view over it, so the module is untouched. */
const named = (cmd: CommandHandlerDefinition, file: string): CommandHandlerDefinition =>
  isNamed(cmd) ? cmd : (Object.create(cmd, { command: { value: basename(file, extname(file)) } }) as CommandHandlerDefinition);

/**
 * A yargs 17 factory over a platform shim and a string table of its own. `modules` is the
 * CommonJS module cache, from the `require()` entry; the `import` entry has none.
 */
export function yargs17(modules?: NodeJS.Dict<NodeJS.Module>): ReturnType<typeof YargsFactory> {
  class Command17 extends CommandInstance {
    override addDirectory(dir: string, req: (p: string) => unknown, callerFile: string, opts: DirOptions = {}): void {
      const visit: Visit = opts.visit ?? ((o) => o);
      const walk = (at: string): void => {
        for (const filename of readdirSync(at)) {
          const joined = join(at, filename);
          if (statSync(joined).isDirectory()) {
            if (opts.recurse === true) walk(joined);
          } else if (joined !== callerFile && included(joined, filename, opts)) {
            const visited = visit(req(joined), joined, filename);
            if (visited && !this.requireCache.has(joined)) {
              this.requireCache.add(joined);
              this.addHandler(named(visited as CommandHandlerDefinition, joined));
            }
          }
        }
      };
      walk(resolve(dirname(callerFile), dir));
    }

    override addHandler(cmd: string | string[] | CommandHandlerDefinition, ...rest: unknown[]): void {
      // 17's `whichModule`: the cached module whose exports this is, for one that names no command.
      const file = isCommandHandlerDefinition(cmd) && !isNamed(cmd) ? Object.values(modules ?? {}).find((mod) => mod?.exports === cmd)?.filename : undefined;
      // @ts-expect-error -- `rest` is `addHandler`'s own tail, handed on unread
      super.addHandler(file === undefined ? cmd : named(cmd as CommandHandlerDefinition, file), ...rest);
    }
  }
  const strings = y18n({ directory: LOCALES, updateFiles: false });
  const make = YargsFactory({ ...shim, y18n: strings, CommandInstance: Command17 });
  return (processArgs, cwd, parentRequire) => {
    const locale = strings.getLocale();
    const instance = make(processArgs, cwd, parentRequire);
    strings.setLocale(locale);
    return instance;
  };
}
