---
"closeout": patch
---

Two fixes, and some code no input could reach is removed.

`closeout/exit-hook` no longer calls asynchronous hooks on a synchronous exit. On `process.exit()` or PM2's `shutdown` message it printed exit-hook's notice that asynchronous tasks "will not run", then called every `asyncExitHook` callback anyway and abandoned the promise. Any code a hook ran before its first `await` therefore ran under closeout and not under exit-hook. Only the synchronous hooks run on that path now, as they do upstream.

A handler registered with a phase that is not `flush`, `release` or `restore` is refused with `TypeError: closeout: no phase <name>`. Before, a misspelled phase from untyped code, such as `onExit(unlock, 'Restore')`, was accepted, never counted and never run. `count()` refuses the same names.

`closeout check` no longer carries a "(replaces …)" helper it never called, or a filter that could never drop a row, because it loads one plugin into an emptied registry. A fallback exit code for a signal outside the five closeout listens on is gone, because there is no such signal. `closeout/exit-hook` also drops a per-event once-guard that duplicated the registry's own, plus two fields of a record no code read.
