// seniority R9: `seniority/lilconfig` against lilconfig's spawn, the same import on both sides.
import { lilconfig } from 'seniority/lilconfig';

process.stdout.write(`${typeof lilconfig === 'function' ? 'Hello, ada!' : 'not loaded'}\n`);
