---
'hookset': patch
---

Ships the 0.3.0 release as 0.3.1. npm refuses 0.3.0 for `hookset` because an earlier package under that name published and then removed it, and npm never lets a removed version number be used again.
