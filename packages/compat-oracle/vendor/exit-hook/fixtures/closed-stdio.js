import process from 'node:process';
import {asyncExitHook, gracefulExit} from '../shim.js';

process.stdout.end();
process.stderr.end();

asyncExitHook(() => {}, {wait: 100});

gracefulExit();
