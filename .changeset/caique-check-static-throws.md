---
"caique": patch
---

`caique check` refuses a widget whose `static` throws on its own `sample`. It used to print the throw as a row, then `<name>: ok`, and exit 0. Now each throwing widget is an `E_NO_STATIC_PROJECTION` refusal that names the widget and what it threw, with a `fix`, and the command exits 1 without printing `ok`.
