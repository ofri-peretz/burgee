# Validator parity reading, 2026-11-13

Regenerated the same day after wave 2 (ours: 97 yes, 5 partial, 52 no; 60, 2, 92 after wave 1; the
first reading was 34, 2, 118).

What is here: `features.json` (154 features, the API and the probe behind every cell),
`semantics.md` (where the libraries disagree on the same nominal feature) and `summary.md` (the
counts, the build list and the proposed benchmark scenarios).

What is not here yet: the probe scripts (`probes/*.mjs`) and `run.mjs` that these files name. They
produced this reading from zod 4.6.7, valibot 1.5.0, arktype 2.2.9, @sinclair/typebox 0.34.52 and
ajv 8.20.0 with ajv-formats 3.0.1, and 609 probes passed, but as written they do not pass this
repository's lint. They are rewritten as the benchmark's own code under `benchmarks/validator/` when
the apples-to-apples benchmark is built (`.sdlc/intents/validator/parity.md`), and this reading is
regenerated from them then. Until that happens this folder is a reading that cannot be re-run from
the repository, and it should be cited as such.
