---
"roundel": patch
---

Three code paths no input could reach are removed; behaviour is unchanged. `roundel check` no longer carries a "(replaces …)" suffix it could never print, because it loads one plugin into an emptied registry. The 16-colour fallback no longer carries a bright-black branch or a lookup default, because black returns before the bright form is built and three bits index all eight names.
