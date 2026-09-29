#!/usr/bin/env node
import process from 'node:process';
import * as execaExports from '../../shim.js';

const methodName = process.argv[2];
await execaExports[methodName]();
