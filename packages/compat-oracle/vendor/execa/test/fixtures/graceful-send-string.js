#!/usr/bin/env node
import {foobarString} from '../helpers/input.js';
import {getCancelSignal, sendMessage} from '../../shim-1.js';

await getCancelSignal();
await sendMessage(foobarString);
