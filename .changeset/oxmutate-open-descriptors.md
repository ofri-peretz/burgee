---
'oxmutate': patch
---

The warm runner writes its progress mark and its result records through descriptors it keeps open, instead of opening and closing both files for every mutant run. On a machine whose endpoint scanner inspects every file close, that open-and-close was most of the warm phase: on burgee's `paratext` (1,415 mutants, about 5,000 test executions) the warm phase fell from 25 s to under 10 s and the whole run from 38 s to about 20 s, with identical verdicts. A machine without such a scanner gains less.
