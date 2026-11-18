---
"oxmutate": patch
---

The Stryker JSON report keeps a source file named `__proto__` as a file entry. It was assigned into a plain object, which set the report object's prototype instead of adding the file.
