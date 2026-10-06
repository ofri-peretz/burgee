---
"paratext": patch
---
The root default (the `ansi-escapes` drop-in object) again carries exactly the incumbent's members. 0.9.0 spread `kittyKeyboardPush`, `kittyKeyboardPop` and `kittyKeyboardQuery` into it, which `ansi-escapes` does not have and which took the entry 128 B over its weight ceiling. They are still exported from `paratext/csi`.
