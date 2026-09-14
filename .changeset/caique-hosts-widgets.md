---
'caique': minor
---

`caique/plugin` — a plugin may now ship a prompt kind caique does not have. `register({ widgets })` keeps the `widgets` key and ignores every other layer's, so the same plugin object works on any subset of the family that is installed (`plugin-contract` R1, R5). A widget is the same shape a flagstaff component is — `{ static, frame?, sample? }` — and one without `static` is refused with `E_NO_STATIC_PROJECTION`, the same code and the same fix shape.

`PromptKind` is an open union (`… | (string & {})`). It was closed, which made a plugin's seventh kind a type error and would have turned hosting `widgets` into a breaking change written as an additive one; the six literals stay in an editor's completion list, which a bare `string` would have thrown away.

Because the union is open, a kind nobody registered no longer falls through to a text prompt — `projectionOf()` refuses it with `E_UNKNOWN_KIND`, and the message names the kinds that *are* registered so the reader sees the typo rather than a text prompt where their widget should have been. The six built-ins are still drawn by caique and a plugin may not replace them: `password` guarantees that nothing writes back what it read, and a third party able to override it could defeat that from a config file.

Also ships `caique/schema.json`, byte-identical to flagstaff's and roundel's (R2) — the specifier caique's own `E_PLUGIN_SCHEMA` fix names, so following the advice resolves.
