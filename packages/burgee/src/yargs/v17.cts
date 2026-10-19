/**
 * What `require('burgee/yargs/v17')` returns: yargs 17's `index.cjs` (`previous-majors` R4).
 *
 * `require('yargs')` in 17 is `Argv`, a function that builds an instance and copies that
 * instance's members onto itself, its methods bound — so `require('yargs').option(…).argv` reads
 * `process.argv`, and `require('yargs')([...])` builds a fresh instance and rebinds the singleton
 * to it. One is built at load, over `process.argv` without its binary. 18 removed it.
 *
 * ## Why this one file is CommonJS
 *
 * A program, and 17's own suite, deletes the entry from `require.cache` and requires it again to
 * get a singleton over a `process.argv` it has just changed. An ES module is evaluated once per
 * process however the cache is edited, so an ESM singleton kept the first `process.argv` and the
 * last instance a test had built. `closeout/signal-exit` is CommonJS for the same reason.
 */
import factory = require('./v17-factory.js');
import utils = require('./utils.js');

/** 17's `index.cjs` refused a Node older than 12, or than `YARGS_MIN_NODE_VERSION` when set. */
const DEFAULT_MIN_NODE = 12;
const minNode = Number(process.env.YARGS_MIN_NODE_VERSION ?? DEFAULT_MIN_NODE);
if (Number(/v([^.]+)/.exec(process.version)?.[1]) < minNode) {
  throw new Error(`yargs supports a minimum Node.js version of ${minNode}. Read our version support policy: https://github.com/yargs/yargs#supported-nodejs-versions`);
}

// 17's `index.cjs` requires its build, and that build makes the platform shim and its strings at
// load: a fresh `require('yargs')` after a cache bust has a fresh string table, so a locale one
// instance updated is not the next one's. The ES modules here load once, so the factory is made
// here, per evaluation of this file. The module cache is how 17 names a command module by its file.
const Yargs = factory.yargs17(require.cache);

type Instance = ReturnType<typeof Yargs>;
type Singleton = ((processArgs?: readonly string[] | string, cwd?: string) => Instance) & Record<string, unknown>;

const Argv = ((processArgs?: readonly string[] | string, cwd?: string): Instance => {
  const argv = Yargs(processArgs as string[] | string | undefined, cwd);
  singletonify(argv);
  return argv;
}) as Singleton;

function singletonify(inst: Instance): void {
  const own = inst as unknown as Record<string, unknown>;
  for (const key of [...Object.keys(own), ...Object.getOwnPropertyNames(Object.getPrototypeOf(own))]) {
    if (key === 'argv') Object.defineProperty(Argv, key, { configurable: true, enumerable: true, get: () => own.argv });
    else if (typeof own[key] === 'function') Argv[key] = (own[key] as (...args: unknown[]) => unknown).bind(own);
    else {
      Object.defineProperty(Argv, '$0', { configurable: true, enumerable: true, get: () => own.$0 });
      Object.defineProperty(Argv, 'parsed', { configurable: true, enumerable: true, get: () => own.parsed });
    }
  }
}

Argv(utils.hideBin(process.argv));

export = Argv;
