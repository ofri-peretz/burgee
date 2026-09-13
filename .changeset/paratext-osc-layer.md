---
'paratext': minor
---

The OSC layer, with the extension surface as its shape rather than an addition to it.

Seven capabilities — `link` (OSC 8), `image` (OSC 1337), `title` (OSC 0), `clipboard`
(OSC 52), `notify` (OSC 9), `cwd` (OSC 50 + 9;9) and `bell` — each one a record of a name, a
detection guess, an encoder and **a static projection**. Nothing in this layer is detectable,
so `emit` returns the projection wherever support is absent or unknown: an image becomes its
caption, a notification a printed line, a hyperlink `text (url)`, and a pipe receives no
control byte at all. That last one is asserted directly, because the failure it prevents —
`]1337;File=inline=1;…` across a user's screen — is what every incumbent ships.

`register` adds or replaces a capability, and the built-ins use that same call, so a
built-in cannot grow a power a third party's plugin lacks. Terminals invent OSC codes faster
than packages ship releases; Kitty's graphics protocol is fifteen lines in the test file,
written entirely through the public API.
