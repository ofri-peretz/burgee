#!/usr/bin/env node
import {$} from '../../shim.js';

const $$ = $({stdio: 'inherit'});
await $$`node -e console.error(1)`;
await $$({reject: false})`node -e process.exit(2)`;
