#!/usr/bin/env node

import { program } from '../../shim.js';

program.command('sub', 'install one or more packages').parse(process.argv);
