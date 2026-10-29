// A hex-colour parser whose every test sits inside a `describe`: the shape whose killed mutants
// Stryker 10.0.0's Vitest runner reported Survived under Vitest 5 (burgee, roundel/src/contrast.ts).
// `MESSAGE` runs at import, so its mutant is static and is judged by an isolated run; the rest are
// judged warm. Both paths must map a mutant to the tests that cover it, never by a test's name.
const MESSAGE = 'not a hex colour';
const HEX_RADIX = 16;

export function parseHex(input: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(input)) throw new Error(`${MESSAGE}: ${input}`);
  return Number.parseInt(input.slice(1), HEX_RADIX);
}
