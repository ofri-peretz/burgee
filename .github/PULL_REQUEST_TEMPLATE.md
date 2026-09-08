## Summary

<!-- One bullet per logical change: what and why. Reference the intent slug
     (.sdlc/intents/<slug>) when this PR implements or amends one. -->

## Floor requirements touched

<!-- F1–F4, O1–O5, E1–E5, V1–V5, S1–S4, P1–P2, D1–D2, T1 — see
     .sdlc/intents/agent-native-cli-layer/design.md. "None" is a valid answer. -->

## Test plan

- [ ] `npm run lint` — 11 Interlace plugins, zero warnings
- [ ] `npm test` — every lock and unit test
- [ ] If this fixes a bug: the new test fails on the unfixed code (name the file)
- [ ] If this touches `packages/*/src`: a changeset is included, or `skip-changeset` is applied

## After merge

<!-- What ships, what to watch, follow-ups. -->
