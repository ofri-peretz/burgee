---
'contractdiff': minor
---

`diff` reads an HTTP operation's security requirement: asking for credentials it did not, or
other ones, is `ac-security-narrowed` (breaking for a caller), and asking for less is
`ac-security-widened`. A renamed path parameter is now reported as `ac-path-parameter-renamed`,
dangerous: the URL is the same, but a client generated from the old contract passes it by name.
