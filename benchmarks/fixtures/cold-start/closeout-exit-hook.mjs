// `closeout/exit-hook` against exit-hook's spawn: the same import and the same registration.
import exitHook from 'closeout/exit-hook';

const unsubscribe = exitHook(() => undefined);
process.stdout.write(`${typeof unsubscribe === 'function' ? 'Hello, ada!' : 'not registered'}\n`);
