Binary: 910 KiB stripped. Spawn of the binary from Node, tiny file: 7.05 ms median.

CPU, in process, single thread (phases.jsonl):

| Subject | Files | MB | JS filter + scan | Rust filter + parse + rewrite | Ratio |
| :-- | --: | --: | --: | --: | --: |
| wait-port | 15 | 0.0 | 0.6 ms | 0.2 ms | 3.6x |
| madge | 115 | 0.1 | 1.3 ms | 0.3 ms | 4.1x |
| tsc-alias | 183 | 0.1 | 2.4 ms | 0.5 ms | 5.0x |
| node-qrcode | 80 | 0.3 | 3.6 ms | 1.0 ms | 3.6x |
| svgo | 120 | 0.5 | 8.0 ms | 2.1 ms | 3.9x |
| docusaurus | 1185 | 3.9 | 59.2 ms | 15.9 ms | 3.7x |
| typeorm | 3625 | 10.9 | 150.5 ms | 37.3 ms | 4.0x |
| bench1000 | 1000 | 3.3 | 26.2 ms | 7.8 ms | 3.4x |

Whole command (gate.json, 7 rounds, load average 110.6–154.9, median 124.3):

| Subject | JS `migrate` wall | JS per-file work | Rust binary, whole pipeline | Ceiling | Projected |
| :-- | --: | --: | --: | --: | --: |
| wait-port | 1700.7 ms | 7.1 ms | 12.2 ms | 1.00x | 1.00x |
| madge | 849.9 ms | 135.8 ms | 82.4 ms | 1.09x | 1.01x |
| tsc-alias | 1501.8 ms | 154.1 ms | 159.4 ms | 1.14x | 1.00x |
| node-qrcode | 1352.3 ms | 87.3 ms | 93.0 ms | 1.07x | 1.00x |
| svgo | 1278.8 ms | 159.6 ms | 108.1 ms | 1.08x | 1.03x |
| docusaurus | 3167.6 ms | 1025.3 ms | 1034.2 ms | 1.48x | 1.06x |
| typeorm | 6222.3 ms | 2920.4 ms | 1937.2 ms | 1.93x | 1.15x |

Median over the five field-trial projects: ceiling **1.08x**, projected **1.00x** (gate: 2x, D-20261020-native-engine-order).
Bytes: fixture byte-identical; 701 of 701 rewritten files byte-identical across 8 subjects; 0 rewritten by one engine only; 0 refused or kept by JS (not compared).
