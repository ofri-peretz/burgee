---
"truefit": major
---

truefit is 1.0. Its entries `.`, `./emit`, `./jit`, `./formats`, `./json-schema` and `./standard` are now a semver contract: a schema built today reads the same values the same way on every 1.x, and an option or builder is removed or changes meaning only in a 2.0. Nothing changed in the code; the evidence is D-20261124-verification-family-1-0: 100% coverage, every spec row built, 143 of the 154 parity features measured against zod, valibot, arktype, typebox and ajv, and a first full mutation run with no surviving mutant.
