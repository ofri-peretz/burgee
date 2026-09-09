---
'compat-oracle': minor
---

The upstream watch covers every declared competitor, not only the hosts with a vendored
suite, and its issue says what our change should be.

A package declares its competitors per subpath in `competitors.json`, holding the claim
(`compat`, `weight` or `surface`) and the last-seen fingerprint — so an upstream release
arrives as a git diff on a committed file. Competitors without a vendored suite are
fingerprinted from the published tarball rather than a clone: downloaded, checked against
the registry's own `dist.shasum`, and unpacked in memory by a tar reader written for the
purpose, so no `npm install` runs and no upstream lifecycle script executes in a job that
holds a token.

Every number is tied to the bytes it came from. The tarball's `package.json` must name the
package and version we asked for, and a disagreement throws rather than reporting a
plausible figure — which is what a watch resolving the declared name `clack` would have
done, since npm's `clack` is an unrelated placeholder at 0.1.0 and the prompts library is
`@clack/prompts`.

The daily issue gains a second half: which of our subpaths claims parity or a weight
ceiling against that package, which published numbers are now stale and the file and line
they are written on, and the `.changeset/*.md` body we should ship — with the bump derived
from the kind of change. An added export on a graded façade is `minor`; a removed export,
or a dropped entry point, proposes no bump at all, because following a removal is a
decision rather than a follow.
