#!/usr/bin/env node
import {execa, getOneMessage} from '../../shim.js';

const {file, commandArguments, options} = await getOneMessage();
const subprocess = execa(file, commandArguments, options);
subprocess.kill(new Error(commandArguments[0]));
await subprocess;
