/**
 * The names `lint`'s rules are written with: the built-in `then` functions. Apart from
 * `lint-functions.ts`, so the plugin host can check a contributed rule without loading the
 * functions' validator.
 */
export const FUNCTIONS = ['truthy', 'falsy', 'defined', 'undefined', 'pattern', 'casing', 'enumeration', 'length', 'xor', 'schema'] as const;
export type FunctionName = (typeof FUNCTIONS)[number];
/** The functions on code (R14): they judge a handler, so only a rule with `given.implementation` names them. */
export const CODE_FUNCTIONS = ['calls', 'validates-input', 'returns-error-shape'] as const;
export type CodeFunctionName = (typeof CODE_FUNCTIONS)[number];
export type ThenName = FunctionName | CodeFunctionName;
