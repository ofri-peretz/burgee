/** Settled at import. Emptying the executor leaves every caller waiting for ever. */
export const ready: Promise<string> = new Promise((resolve) => {
  resolve('done');
});
