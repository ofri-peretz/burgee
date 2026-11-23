---
"apicontract": minor
---

`apicontract props <contract>`: property tests drawn from the contract, with no server. Values are made from each payload's JSON Schema by a generator written apart from the validator, and four properties are checked: the validator accepts every value made and refuses each with one constraint broken, at the place broken; values survive JSON and back; `normalise` is idempotent and accepts what the schema accepts; and, with `--against <old>`, every payload the classifier calls compatible passes the receiver for any value the sender may send. Runs replay from the printed `--seed`, counterexamples are shrunk, keywords the generator does not hold to are reported, and `--emit <file>` writes fast-check arbitraries for a consumer's own tests.
