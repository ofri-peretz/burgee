/**
 * caique — prompts that are flags first. The first working slice is `decide()`: the pure
 * rule that decides whether a person can be asked at all, which is what keeps a CLI built
 * on this from hanging when an agent runs it. Widgets and the two façades follow; see
 * `.sdlc/intents/caique/`.
 */
export * from './ask.js';
export * from './binding.js';
export * from './decide.js';
export * from './raw.js';
export * from './spec.js';
export * from './terminal.js';

/**
 * Named, not starred: `runtime.ts` and `decide.ts` both call their slice `Runtime`, and two
 * star exports of one name is an ambiguity TypeScript resolves by dropping it. The root
 * keeps `decide`'s — the one a caller of `decide()` constructs — and takes the function.
 */
export { processRuntime } from './runtime.js';
