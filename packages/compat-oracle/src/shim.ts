/**
 * The one line that decides what the vendored suites grade.
 *
 * `COMPAT_TARGET=commander` grades the real thing, which proves the gate before
 * it grades anything of ours. `COMPAT_TARGET=burgee/commander` grades us.
 */
const target = process.env['COMPAT_TARGET'] ?? 'commander';
const loaded: unknown = await import(target);
export default loaded;
