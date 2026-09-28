---
"closeout": patch
---

Fixed: a second signal during shutdown killed the process before the terminal was restored. A second Ctrl-C, or a SIGTERM that arrived while a handler was still running, left the terminal in raw mode, on the alternate screen, with the cursor hidden. A second trigger now waits for the shutdown already running, so the terminal is restored first and the process dies of the first signal. The deadline still bounds the wait.
