#!/usr/bin/env node
import process from 'node:process';
import meow from '../../../../shim.js';

meow({importMeta: import.meta});
console.log(process.title);
