---
'burgee': patch
---

`scripts/lanes.ts --check` now grants every lane its own changeset, which `.sdlc/LANES.md` has
granted since the first run of these lanes.

The document said it; the script did not implement it. So `--check` called each lane's own
changeset a stray, and every lane brief had to tell its agent to ignore the result of its own
boundary check — which makes the check worth nothing. A rule stated in the document and absent
from the enforcement is the exact drift this file exists to prevent, committed by the file that
prevents it.

The exemption is read from the paragraph that grants it rather than written down a second time,
and it is narrow on both axes: `.changeset/config.json` is still a stray, `*` does not cross a
slash, and another lane's source file is still another lane's. `lane-boundaries-lock.test.ts`
holds all three, and goes red when the exemption is reverted.
