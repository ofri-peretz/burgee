// controlroom W4: what an Ink program pays to start before it draws anything — ink, and the
// React it renders through. The line proves both loaded, so a fixture that stopped importing
// either cannot print the floor's bytes.
import { render } from 'ink';
import React from 'react';

process.stdout.write(`${typeof render === 'function' && typeof React.createElement === 'function' ? 'Hello, ada!' : 'not loaded'}\n`);
