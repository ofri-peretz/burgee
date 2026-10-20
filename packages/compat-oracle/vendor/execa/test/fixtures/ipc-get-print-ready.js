#!/usr/bin/env node
import {getOneMessage, sendMessage} from '../../shim.js';

const messagePromise = getOneMessage();
await sendMessage('.');
console.log(await messagePromise);
