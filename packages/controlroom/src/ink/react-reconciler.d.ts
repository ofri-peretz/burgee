/**
 * The slice of `react-reconciler` this package calls. The package ships no types and
 * `@types/react-reconciler` trails the releases; both reconciler lines are covered — 0.29
 * (React 18) and 0.31+ (React 19) — so every member that only one of them has is optional.
 */
declare module 'react-reconciler' {
  export interface Reconciler {
    createContainer(...args: unknown[]): unknown;
    updateContainer(element: unknown, container: unknown, parent: unknown, callback: () => void): void;
    updateContainerSync?(element: unknown, container: unknown, parent: unknown, callback: () => void): void;
    flushSyncWork?(): void;
    flushSync?(fn: () => void): void;
    flushSyncFromReconciler?(fn: () => void): void;
    batchedUpdates<T>(fn: () => T): T;
    injectIntoDevTools?(config: unknown): boolean;
  }
  const createReconciler: (config: Record<string, unknown>) => Reconciler;
  export default createReconciler;
}
