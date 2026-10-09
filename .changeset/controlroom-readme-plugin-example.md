---
"controlroom": patch
---

README: the Plugins example now default-exports its plugin, so `controlroom check` accepts it, and registers flagstaff's `log-tail` before `open()`, which threw for a pane drawn with an unregistered component.
