// `closeout/signal-exit` against signal-exit's spawn: the same import and the same registration.
import { onExit } from 'closeout/signal-exit';

const remove = onExit(() => undefined);
process.stdout.write(`${typeof remove === 'function' ? 'Hello, ada!' : 'not registered'}\n`);
