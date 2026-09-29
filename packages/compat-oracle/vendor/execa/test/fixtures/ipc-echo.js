#!/usr/bin/env node
import {sendMessage, getOneMessage} from '../../shim.js';

await sendMessage(await getOneMessage());
