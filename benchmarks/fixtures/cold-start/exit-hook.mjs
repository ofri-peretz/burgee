// closeout's spawn bar: what exit-hook costs to start. Imports the default and registers one no-op
// hook, which is the call a program makes, and prints the floor's line only when it registered.
import exitHook from 'exit-hook';

const unsubscribe = exitHook(() => undefined);
process.stdout.write(`${typeof unsubscribe === 'function' ? 'Hello, ada!' : 'not registered'}\n`);
