/**
 * `burgee/yargs/v17/yargs` — yargs 17's `yargs/yargs`: the factory, never the singleton, with
 * the three statics 17 hangs on it (`applyExtends`, `hideBin`, `Parser`). The form 17's README
 * teaches for CommonJS, `require('yargs/yargs')(hideBin(process.argv))`, and `burgee migrate`
 * writes this entry for it (`previous-majors` R3, R6).
 *
 * A function of its own, so the statics never land on `burgee/yargs`'s factory, which 18 serves.
 */
import Yargs, { applyExtends, hideBin, Parser } from './v17.js';

const factory = Object.assign((...args: Parameters<typeof Yargs>) => Yargs(...args), { applyExtends, hideBin, Parser });

export { factory as 'module.exports' };
export default factory;
