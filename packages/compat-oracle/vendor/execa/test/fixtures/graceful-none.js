#!/usr/bin/env node
import {getCancelSignal} from '../../shim-1.js';

await getCancelSignal();
