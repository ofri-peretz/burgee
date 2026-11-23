/** Does nothing when `armed` is false. Mutated so the condition holds, it kills the worker's process with SIGKILL, as the kernel's out-of-memory kill does. */
export const boom = (armed: boolean): void => {
  if (armed) process.kill(process.pid, 'SIGKILL');
};
