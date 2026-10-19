/**
 * `react-reconciler` ships no types and `@types/react-reconciler` trails the releases. This
 * shim only lets the `import()` in `react.ts` compile: the slice this package calls is
 * `Reconciler` in `react.ts`, not here, because this file is not published. A published
 * declaration that named `import("react-reconciler")` left every consumer with
 * `skipLibCheck: false` on TS7016, since the peer they install has no types either.
 */
declare module 'react-reconciler' {
  const createReconciler: (config: Record<string, unknown>) => unknown;
  export default createReconciler;
}
