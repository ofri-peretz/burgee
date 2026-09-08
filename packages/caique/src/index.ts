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
