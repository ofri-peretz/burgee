---
"bellpull": patch
"caique": patch
"closeout": patch
"flagstaff": patch
"linegauge": patch
"paratext": patch
"roundel": patch
"seniority": patch
---

`<package> --help` and `--version` answer instead of crashing. The bin took its first argument as the plugin file to import, so `roundel --help` failed with `Cannot find module '…/--help'` and exit 1. `-h`/`--help` now print usage and exit 0, `-V`/`--version` print the version and exit 0, and any other flag where the plugin file belongs is a usage error, exit 2.
