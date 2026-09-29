#!/usr/bin/env node
import {sendMessage} from '../../shim.js';
import {foobarString} from '../helpers/input.js';

await sendMessage(foobarString, {strict: true});
