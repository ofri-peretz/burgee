---
"loadline": minor
---

`jsonSchemaReader(document)` reads many schemas against one document, such as every payload of an
OpenAPI document against its `components`: each `$ref` is read once and shared by every schema that
names it, where `fromJsonSchema` on each reads the whole graph behind it again. A schema that reaches
a reference that cannot be read is refused every time it is read, however deep the reference is.
