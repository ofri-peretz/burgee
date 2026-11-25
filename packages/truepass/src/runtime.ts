/**
 * truepass's one view of the process (burgee's Runtime seam rule: no layer source names `process`
 * outside its package's `runtime.ts`). The budget reporter and `truepass budget` read the
 * environment, the directory and the node binary here, and set the exit code and write to stderr
 * through it.
 */
export const env = (): NodeJS.ProcessEnv => process.env;
export const cwd = (): string => process.cwd();
export const pid = (): number => process.pid;
export const execPath = (): string => process.execPath;
export const writeErr = (text: string): void => {
  process.stderr.write(text);
};
export const setExitCode = (code: number): void => {
  process.exitCode = code;
};
