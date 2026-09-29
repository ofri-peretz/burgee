#!/usr/bin/env node
import {sendMessage, getOneMessage} from '../../shim.js';

const [message] = await getOneMessage();
await sendMessage(message);
