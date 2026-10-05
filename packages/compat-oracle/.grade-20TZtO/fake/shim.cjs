// generated per run — COMPAT_TARGET=commander
const target = require.resolve("commander");
const seen = (globalThis[Symbol.for('compat-oracle.shim-loads')] ??= new Set());
if (seen.has(__filename)) delete require.cache[target];
seen.add(__filename);
const loaded = require(target);
module.exports = loaded;
