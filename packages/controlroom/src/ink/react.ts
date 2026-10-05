/**
 * The program's React, loaded once (R11). Every file under `src/ink/` that needs React or the
 * reconciler takes it from here, so the optional peers are reached in one place and a missing
 * one is one refusal with one `fix`.
 */
import { loadPeer } from './peers.js';

export const React = (await loadPeer('react', async () => import('react'))).default;
export const createReconciler = (await loadPeer('react-reconciler', async () => import('react-reconciler'))).default;
export const constants = (await loadPeer('react-reconciler', async () => import('react-reconciler/constants.js'))).default;
