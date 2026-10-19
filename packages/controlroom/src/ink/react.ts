/**
 * The program's React, loaded once (R11). Every file under `src/ink/` that needs React or the
 * reconciler takes it from here, so the optional peers are reached in one place and a missing
 * one is one refusal with one `fix`.
 */
import { loadPeer } from './peers.js';

// Declared here, not in the unpublished `react-reconciler.d.ts` shim: a published reference to
// `import("react-reconciler")`, which ships no types, was TS7016 for every consumer with
// `skipLibCheck: false` (`scripts/declaration-reach.test.ts`, spec `types-under-node10` R4).
/** The slice of `react-reconciler` used, 0.29 (React 18) and 0.31+ (React 19); one-line members optional. */
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

export const React = (await loadPeer('react', async () => import('react'))).default;
export const createReconciler = (await loadPeer('react-reconciler', async () => import('react-reconciler'))).default as (config: Record<string, unknown>) => Reconciler;
export const constants = (await loadPeer('react-reconciler', async () => import('react-reconciler/constants.js'))).default;
