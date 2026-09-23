---
"burgee": patch
---

The installed `burgee` command runs. `dist/cli.js` shipped without `#!/usr/bin/env node`, so `npx burgee …` and the linked bin were handed to `/bin/sh` on macOS and Linux and failed with `import: command not found`. `check:artifacts` now refuses any published bin that is missing from the pack list or does not start with the shebang.
