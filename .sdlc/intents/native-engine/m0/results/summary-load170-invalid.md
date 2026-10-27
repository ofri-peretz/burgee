Load average at the wall-time run: 162.3 / 179.1 / 122.2 on 14 cores. Spawn of the binary from Node: 7.05 ms. Binary: 910 KiB stripped.

| Subject | Files | MB | JS `migrate` wall | JS CPU (filter + scan) | Rust CPU (filter + parse) | CPU ratio | JS per-file (I/O + CPU) | Rust per-file, 8 threads | Ceiling | Projected |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| wait-port | 15 | 0.0 | 984.5 ms | 0.6 ms | 0.2 ms | 3.6x | 4.0 ms | 2.8 ms | 1.0x | 0.99x |
| madge | 115 | 0.1 | 983.0 ms | 1.3 ms | 0.3 ms | 4.1x | 25.9 ms | 14.5 ms | 1.0x | 1.00x |
| tsc-alias | 183 | 0.1 | 836.7 ms | 2.4 ms | 0.5 ms | 5.0x | 54.3 ms | 49.6 ms | 1.1x | 1.00x |
| node-qrcode | 80 | 0.3 | 623.6 ms | 3.6 ms | 1.0 ms | 3.6x | 16.3 ms | 11.4 ms | 1.0x | 1.00x |
| svgo | 120 | 0.5 | 1937.6 ms | 8.0 ms | 2.1 ms | 3.9x | 43.8 ms | 29.8 ms | 1.0x | 1.00x |
| docusaurus | 1185 | 3.9 | 2151.7 ms | 59.2 ms | 15.9 ms | 3.7x | 397.4 ms | 362.5 ms | 1.2x | 1.01x |
| typeorm | 3625 | 10.9 | 3666.7 ms | 150.5 ms | 37.3 ms | 4.0x | 1738.9 ms | 1491.3 ms | 1.9x | 1.07x |
| bench1000 | 1000 | 3.3 | 2713.9 ms | 26.2 ms | 7.8 ms | 3.4x | 416.5 ms | 401.3 ms | 1.2x | 1.00x |

Median projected speedup over the five field-trial projects: **1.00x** (gate: 2x, D-20261020-native-engine-order).
Median ceiling (per-file work at zero cost) over the same five: **1.03x**.
Bytes: fixture byte-identical; 701 of 701 rewritten files byte-identical across 8 subjects; 0 rewritten by Rust only, 0 by JS only; 0 refused or kept by JS (not compared).
