// The `signal-exit` drop-in's bar: what signal-exit costs to start. Imports `onExit` and registers
// one no-op handler, printing the floor's line only when it registered.
import { onExit } from 'signal-exit';

const remove = onExit(() => undefined);
process.stdout.write(`${typeof remove === 'function' ? 'Hello, ada!' : 'not registered'}\n`);
