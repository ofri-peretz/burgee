import React from 'react';
import {Text, render} from '../../shim.js';

const {waitUntilExit} = render(<Text>Hello World</Text>);

await waitUntilExit();
console.log('exited');
