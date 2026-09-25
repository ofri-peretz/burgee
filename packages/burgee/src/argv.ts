/**
 * The readings of argv that both the engine and its lazily loaded surfaces make, in one place so
 * they cannot disagree: where options end, which flag asks for `--json`, and whether a surface
 * might be asked for.
 */

/** The part of argv the parser will read as options: everything before `--`. */
export function beforeTerminator(argv: readonly string[]): readonly string[] {
  const at = argv.indexOf('--');
  return at === -1 ? argv : argv.slice(0, at);
}

/** `--json`, or `--json=<fields>` (N14). */
export function isJsonFlag(arg: string): boolean {
  return arg === '--json' || arg.startsWith('--json=');
}

/**
 * Whether argv could be asking for a surface — the cheap test the engine runs on every
 * invocation, so `surfaces.js` loads only when it might answer (U5). It admits a superset:
 * `serve` there still checks each surface's own condition (a program that defines its own
 * `completion`, `config explain` without config) and answers `false` when none applies.
 */
export function mayServe(argv: readonly string[]): boolean {
  const head = beforeTerminator(argv);
  const first = argv[0];
  return first === '__complete' || first === 'completion' || first === 'help' || head[0] === '--mcp' || (head[0] === 'config' && head[1] === 'explain') || head.includes('--schema');
}
