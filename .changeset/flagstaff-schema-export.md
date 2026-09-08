---
'flagstaff': patch
---

Export `flagstaff/schema.json`.

`PluginError`'s fix for `E_PLUGIN_SCHEMA` tells a plugin author to "compare the object
against flagstaff/schema.json", and that specifier did not resolve — following the advice
got `ERR_PACKAGE_PATH_NOT_EXPORTED`. The file already shipped in the tarball; only the
`exports` entry was missing.
