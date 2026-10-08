---
"burgee": patch
---

The plugin host's hook refusals are now a single refusal, `<stage> is not { handler, filter?: { command: RegExp } }`, and its fix shows that shape. It covers a missing handler, a function or an array where the hook object should be, a string `command` and a bare RegExp used as the filter. A contributed command whose refusal carries no separate remedy now gets its own message as the fix. The core bundle goes from 24,431 back to 24,260 bytes, under the 24,282 ceiling that #848 crossed.
