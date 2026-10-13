---
"burgee": minor
"compat-oracle": patch
---

Commander 14 is supported. `burgee/commander/v14` is a new entry point for programs written for commander 14. Commander 14.0.3's own suite grades it 1331 of 1331, level with commander 14 itself. It is `burgee/commander` with the one behaviour the two majors differ on: the excess-arguments message stops at the count (`Expected 0 arguments but got 1.`), where 15 also names the surplus arguments. `burgee migrate` now rewrites a project pinned to commander 14 (`^14`, `~14`, or installed at 14.x) to `burgee/commander/v14` instead of leaving it alone as off-major. A program on 15 still imports `burgee/commander` and bundles none of it: this change leaves that entry's 55,661 B as it is, and the new one bundles to 56,010 B.
