#!/usr/bin/env node
import process from 'node:process';
import {sendMessage, getOneMessage} from '../../shim.js';
import {foobarString} from '../helpers/input.js';

await sendMessage(foobarString);

process.stdout.write('.');

await getOneMessage();
