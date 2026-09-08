/**
 * roundel — the colours a CLI carries. One output policy, semantic tokens over
 * `util.styleText`, a theme set once, and the WCAG maths that keeps a truecolor theme
 * readable. Zero dependencies; every subpath costs only itself (`roundel/policy`,
 * `roundel/tokens`, `roundel/theme`, `roundel/contrast`). This entry re-exports and does
 * nothing else.
 */
export { colorLevel, outputMode, type ColorLevel, type OutputMode, type PolicyRuntime } from './policy.js';
export { createTokens, PLAIN, type Style, type Tokens } from './tokens.js';
export { BRAND_THEME, currentTheme, DEFAULT_GROUND, DEFAULT_THEME, fly, strike, TOKENS, type FlyOptions, type Theme, type Token, type TokenStyle } from './theme.js';
export { AA, channels, contrast, luminance, mix } from './contrast.js';
