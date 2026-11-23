/**
 * hookset's one view of the process (burgee's Runtime seam rule: no layer source names `process`
 * outside its package's `runtime.ts`). The CLI reads only the directory it was started in.
 */
export const cwd = (): string => process.cwd();
