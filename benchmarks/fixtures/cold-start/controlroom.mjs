// controlroom W4: the native API's screen, which never loads React.
import { open } from 'controlroom';

process.stdout.write(`${typeof open === 'function' ? 'Hello, ada!' : 'not loaded'}\n`);
