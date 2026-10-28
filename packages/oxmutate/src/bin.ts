#!/usr/bin/env node
import { run } from 'burgee';

import { program } from './cli.js';

await run(program);
