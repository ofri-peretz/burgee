// controlroom W4: the same program on the drop-in. Importing it loads the program's React and
// React's reconciler (optional peers, under top-level await), so this row pays for all three.
import { render } from 'controlroom/ink';
import React from 'react';

process.stdout.write(`${typeof render === 'function' && typeof React.createElement === 'function' ? 'Hello, ada!' : 'not loaded'}\n`);
