---
"flagstaff": patch
---

The plugin host's JSON Schema walker reads a node's own keywords beside its `anyOf`: a branch that admits the value no longer excuses a sibling `required` or `properties`. flagstaff's own plugin schema uses no `anyOf`, so no plugin is accepted or refused differently.
