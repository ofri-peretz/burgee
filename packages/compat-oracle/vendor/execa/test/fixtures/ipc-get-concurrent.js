#!/usr/bin/env node
import {argv} from 'node:process';
import {getOneMessage} from '../../shim.js';

const messages = await Promise.all(Array.from({length: Number(argv[2])}, () => getOneMessage()));
console.log(messages.length);
