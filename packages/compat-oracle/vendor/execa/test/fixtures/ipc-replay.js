#!/usr/bin/env node
import {setTimeout} from 'node:timers/promises';
import {sendMessage, getOneMessage} from '../../shim.js';

await sendMessage(await getOneMessage());
await setTimeout(1e3);
await sendMessage(await getOneMessage());
