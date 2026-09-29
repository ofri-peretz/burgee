#!/usr/bin/env node
import {getCancelSignal, sendMessage, getOneMessage} from '../../shim-1.js';

await getCancelSignal();
await sendMessage(await getOneMessage());
