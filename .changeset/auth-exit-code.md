---
'burgee': minor
---

`ExitCode.AUTH` — a refused credential gets its own code (E6).

`RUNTIME` is the code for everything: *it failed, read the message*. A caller — a script, a
retry loop, an agent — cannot branch on it, so a 401 and a null-pointer look identical from
outside and a retry on one is a retry on both, forever.

```ts
import { AuthError } from 'burgee';

throw new AuthError('the registry refused the token', 'the token has expired', 'mytool login');
// exit 5, and on --json: { ok: false, error: { code: 5, message, hint, fix } }
```

`AUTH` says *get a credential and run it again*, which is a different action from `USAGE`'s
*fix the script* and `CONFIG`'s *fix the runner*. The requirement calls it "the most actionable
single code in the survey"; it was the one the taxonomy was missing.

**5, where `gh` uses 4.** Four is `CANCELLED` here and has been since the contract was written,
and moving a published code to match a neighbour's is a breaking change for everyone already
branching on it. `aws` v2 uses 252/253/254 and agrees with nobody either — what matters is that
the code is stable and documented.

`fix` is the line a caller runs where `hint` is the prose a person reads, and both reach the
`--json` envelope, so an agent never has to parse the message.

374 bytes on the core entry.
