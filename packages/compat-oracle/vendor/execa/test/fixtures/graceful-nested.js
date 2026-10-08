#!/usr/bin/env node
import {execa, getCancelSignal, sendMessage} from '../../shim-1.js';

const cancelSignal = await getCancelSignal();
// Neither the messages nor the disconnection of this process' own subprocess must abort its `cancelSignal`
await execa('ipc-send-cancel-shape.js', {ipc: true});
await sendMessage(cancelSignal.aborted);
