/**
 * R11 — `react` and `react-reconciler` are the program's own, optional peers of
 * `controlroom`, and this is the one file that loads them. Nothing outside `controlroom/ink`
 * reaches it, so the native API installs and loads with neither.
 *
 * Loaded with `import()` rather than a static import, so a missing peer is a refusal with a
 * `fix` on first import instead of a resolver error naming a file the user never wrote.
 * Ink itself has top-level await, so this changes nothing a caller could observe.
 */
export type PeerName = 'react' | 'react-reconciler';

/** The install line a missing peer's `fix` names: both peers, since the reconciler is React's own. */
export const INSTALL = 'npm install react react-reconciler';

/** The drop-in's refusal vocabulary: a missing optional peer, and nothing else. */
export type InkErrorCode = 'E_PEER_MISSING';

/** A refusal in the family's shape: what is wrong, and what to do about it. */
export class InkPeerError extends Error {
  readonly code: InkErrorCode = 'E_PEER_MISSING';
  readonly fix: string;
  constructor(readonly peer: PeerName) {
    super(`controlroom/ink needs \`${peer}\`, which is an optional peer and is not installed`);
    this.name = 'InkPeerError';
    this.fix = `${INSTALL} — controlroom/ink renders through React's own reconciler, as ink does`;
  }
}

const missing = (cause: unknown): boolean => {
  const code = (cause as { code?: unknown } | null)?.code;
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
};

/** `load` is `import()` in production; a test passes its own to stand in for an absent package. */
export async function loadPeer<M>(peer: PeerName, load: () => Promise<M>): Promise<M> {
  try {
    return await load();
  } catch (cause) {
    if (missing(cause)) throw new InkPeerError(peer);
    throw cause;
  }
}
