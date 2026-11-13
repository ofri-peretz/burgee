---
'oxmutate': patch
---

A run no longer loses its result when its work directory cannot be removed. The directory was removed straight after the servers were told to close, while a worker could still write into it; a removal that met a write threw `ENOTEMPTY` and replaced the finished run with that error, and no report was written (seen at the end of a 60-minute run). The removal now retries, and a directory that still cannot be removed is named in a warning.
