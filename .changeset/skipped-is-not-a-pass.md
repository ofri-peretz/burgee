---
'compat-oracle': patch
---

The compatibility grade no longer subtracts a skipped case from a total that never held it. mocha leaves a pending test out of both `# tests` and `# pass`, so the extra subtraction produced `804 passing out of 803 run` — impossible, and wrong in the direction that flatters. Runners that print a skip summary (node:test, ava) still have it subtracted from the denominator, because theirs do count it.
