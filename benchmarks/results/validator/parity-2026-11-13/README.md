# Validator parity reading, 2026-11-13

Regenerated on 2026-11-14 after wave 3 (ours: 119 yes, 4 partial, 31 no; 97, 5, 52 after wave 2;
60, 2, 92 after wave 1; the first reading was 34, 2, 118). Updated on 2026-11-17 after wave 4 (ours:
143 yes, 4 partial, 7 no): the 24 cells of "ours" that changed name the test that holds each one
(`packages/validator/src/wave4.test.ts`), since `probes/ours.mjs` is not in the repository either;
the competitors' cells are unchanged.

What is here: `features.json` (154 features, the API and the probe behind every cell),
`semantics.md` (where the libraries disagree on the same nominal feature) and `summary.md` (the
counts, the build list and the proposed benchmark scenarios).

What is not here yet: the probe scripts (`probes/*.mjs`) and `run.mjs` that these files name. They
produced this reading from zod 4.6.7, valibot 1.5.0, arktype 2.2.9, @sinclair/typebox 0.34.52 and
ajv 8.20.0 with ajv-formats 3.0.1, and 609 probes passed, but as written they do not pass this
repository's lint. They are rewritten as the benchmark's own code under `benchmarks/validator/` when
the apples-to-apples benchmark is built (`.sdlc/intents/loadline/parity.md`), and this reading is
regenerated from them then. Until that happens this folder is a reading that cannot be re-run from
the repository, and it should be cited as such.
