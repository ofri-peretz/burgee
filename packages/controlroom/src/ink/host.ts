/**
 * R11 — the `react-reconciler` host config: React's own reconciler, driving the host tree in
 * `dom.ts`, as ink 8's `reconciler.ts` does. One config serves both reconciler lines a program
 * may bring: 0.29 (React 18, with `prepareUpdate` and a payload argument) and 0.31+ (React 19,
 * with update priorities and `commitUpdate(instance, type, …)`). Each member only one line
 * reads is harmless to the other.
 */
import { type Reconciler } from 'react-reconciler';

import {
  appendChildNode,
  applyStyles,
  createNode,
  createTextNode,
  type DOMElement,
  type DOMNode,
  type ElementName,
  emitLayoutListeners,
  freeYogaSubtree,
  insertBeforeNode,
  removeChildNode,
  setAttribute,
  setNodeHidden,
  setStyle,
  setTextNodeValue,
  setTransform,
  type Styles,
  type TextNode,
  type Transformer,
} from './dom.js';
import { replayConsole } from './process.js';
import { constants, createReconciler, React } from './react.js';

interface HostContext {
  isInsideText: boolean;
}

type Props = Record<string, unknown>;

/** The props that changed between two renders, `undefined` for a removed one; `undefined` when none did. */
function diff(before: Props | undefined, after: Props | undefined): Props | undefined {
  if (before === after) return undefined;
  if (before === undefined) return after;
  const changed: Props = {};
  let isChanged = false;
  for (const key of Object.keys(before)) {
    if (after === undefined || !Object.hasOwn(after, key)) {
      changed[key] = undefined;
      isChanged = true;
    }
  }
  for (const [key, value] of Object.entries(after ?? {})) {
    if (value !== before[key]) {
      changed[key] = value;
      isChanged = true;
    }
  }
  return isChanged ? changed : undefined;
}

let currentUpdatePriority = constants.NoEventPriority ?? 0;

function findRootNode(node: DOMElement): DOMElement | undefined {
  for (let current: DOMElement | undefined = node; current !== undefined; current = current.parentNode) if (current.nodeName === 'ink-root') return current;
  return undefined;
}

/** A removed subtree that holds the root's `<Static>` takes the reference with it. */
function clearStaticNodeIfContained(rootNode: DOMElement | undefined, removed: DOMNode): void {
  if (rootNode?.staticNode === undefined) return;
  for (let current: DOMElement | undefined = rootNode.staticNode; current !== undefined; current = current.parentNode) {
    if (current === removed) {
      rootNode.staticNode = undefined;
      return;
    }
  }
}

function findStaticNode(node: DOMElement): DOMElement | undefined {
  if (node.internal_static === true) return node;
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') continue;
    const found = findStaticNode(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

function resetAfterCommit(rootNode: DOMElement): void {
  // The committed tree's `<Static>`: an abandoned transition's instances must not replace it.
  const staticNode = findStaticNode(rootNode);
  rootNode.staticNode = staticNode;
  if (staticNode !== rootNode.previousStaticNode) rootNode.isStaticDirty = true;
  rootNode.onComputeLayout?.();
  emitLayoutListeners(rootNode);
  // A replaced or removed `<Static>` resets the accumulated output before the new one emits.
  if (rootNode.staticNode !== rootNode.previousStaticNode) {
    rootNode.previousStaticNode = rootNode.staticNode;
    rootNode.onStaticChange?.();
  }
  // Static's children render once and are then removed, so a commit that added some is
  // written at once rather than waiting on the throttle, before the next commit erases them.
  if (rootNode.isStaticDirty === true) {
    rootNode.isStaticDirty = false;
    rootNode.onImmediateRender?.();
    return;
  }
  rootNode.onRender?.();
}

function commitUpdate(node: DOMElement, oldProps: Props, newProps: Props): void {
  if (node.internal_static === true) {
    const rootNode = findRootNode(node);
    if (rootNode !== undefined) rootNode.isStaticDirty = true;
  }
  const props = diff(oldProps, newProps);
  const style = diff(oldProps['style'] as Props | undefined, newProps['style'] as Props | undefined);
  if (props === undefined && style === undefined) return;
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'children') continue;
    if (key === 'style') setStyle(node, value as Styles | undefined);
    else if (key === 'internal_transform') setTransform(node, value as Transformer | undefined);
    else if (key === 'internal_static') node.internal_static = true;
    else setAttribute(node, key, value);
  }
  if (style !== undefined && node.yogaNode !== undefined) applyStyles(node.yogaNode, style as Styles, (newProps['style'] as Styles | undefined) ?? {});
}

export const reconciler: Reconciler = createReconciler({
  getRootHostContext: (): HostContext => ({ isInsideText: false }),
  prepareForCommit: () => null,
  preparePortalMount: () => null,
  clearContainer: () => false,
  resetAfterCommit,
  getChildHostContext(parent: HostContext, type: string): HostContext {
    const isInsideText = type === 'ink-text' || type === 'ink-virtual-text';
    return parent.isInsideText === isInsideText ? parent : { isInsideText };
  },
  shouldSetTextContent: () => false,
  createInstance(originalType: ElementName, props: Props, _root: DOMElement, hostContext: HostContext): DOMElement {
    if (hostContext.isInsideText && originalType === 'ink-box') throw new Error('<Box> can’t be nested inside <Text> component');
    const node = createNode(originalType === 'ink-text' && hostContext.isInsideText ? 'ink-virtual-text' : originalType);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'children') continue;
      if (key === 'style') {
        setStyle(node, value as Styles | undefined);
        if (node.yogaNode !== undefined) applyStyles(node.yogaNode, value as Styles | undefined);
      } else if (key === 'internal_transform') node.internal_transform = value as Transformer | undefined;
      else if (key === 'internal_static') node.internal_static = true;
      else setAttribute(node, key, value);
    }
    return node;
  },
  createTextInstance(text: string, _root: DOMElement, hostContext: HostContext): TextNode {
    if (!hostContext.isInsideText) throw new Error(`Text string "${text}" must be rendered inside <Text> component`);
    return createTextNode(text);
  },
  resetTextContent() {},
  hideTextInstance: (node: TextNode) => setTextNodeValue(node, ''),
  unhideTextInstance: (node: TextNode, text: string) => setTextNodeValue(node, text),
  getPublicInstance: (instance: unknown) => instance,
  hideInstance: (node: DOMElement) => setNodeHidden(node, true),
  unhideInstance: (node: DOMElement) => setNodeHidden(node, false),
  appendInitialChild: appendChildNode,
  appendChild: appendChildNode,
  insertBefore: insertBeforeNode,
  finalizeInitialChildren: () => false,
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  detachDeletedInstance() {},
  getInstanceFromNode: () => null,
  // Fragment refs (React 19.3) mean nothing in a terminal: a `<Fragment ref>` resolves to null.
  createFragmentInstance: () => null,
  prepareScopeUpdate() {},
  getInstanceFromScope: () => null,
  appendChildToContainer: appendChildNode,
  insertInContainerBefore: insertBeforeNode,
  removeChildFromContainer(node: DOMElement, removed: DOMNode) {
    // `node` is the root itself; clear before the parent chain breaks.
    clearStaticNodeIfContained(findRootNode(node), removed);
    removeChildNode(node, removed);
    freeYogaSubtree(removed);
  },
  removeChild(node: DOMElement, removed: DOMNode) {
    clearStaticNodeIfContained(findRootNode(node), removed);
    removeChildNode(node, removed);
    freeYogaSubtree(removed);
  },
  // React 18 computes a payload first and hands it to `commitUpdate` as the second argument;
  // React 19 drops `prepareUpdate` and passes the type there instead.
  prepareUpdate: () => true,
  commitUpdate(node: DOMElement, ...rest: unknown[]) {
    if (typeof rest[0] === 'string') commitUpdate(node, rest[1] as Props, rest[2] as Props);
    else commitUpdate(node, rest[2] as Props, rest[3] as Props);
  },
  commitTextUpdate: (node: TextNode, _old: string, text: string) => setTextNodeValue(node, text),
  // Event priority: one hook on React 18's reconciler line, three on React 19's.
  getCurrentEventPriority: () => constants.DefaultEventPriority,
  setCurrentUpdatePriority(priority: number) {
    currentUpdatePriority = priority;
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () => (currentUpdatePriority === (constants.NoEventPriority ?? 0) ? constants.DefaultEventPriority : currentUpdatePriority),
  maySuspendCommit: () => true,
  // A terminal host instance has no resource to wait for on an update.
  maySuspendCommitOnUpdate: () => false,
  maySuspendCommitInSyncRender: () => false,
  NotPendingTransition: undefined,
  HostTransitionContext: React.createContext(null),
  resetFormInstance() {},
  requestPostPaintCallback() {},
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent() {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  preloadInstance: () => true,
  startSuspendingCommit() {},
  suspendInstance() {},
  // Every transition-lane render since React 19.3: there is never a view transition to wait for.
  suspendOnActiveViewTransition() {},
  waitForCommitToBeReady: () => null,
  getSuspendedCommitReason: () => null,
  extraDevToolsConfig: null,
  // React's captured console calls, replayed without a browser's badge styling.
  bindToConsole: (methodName: string, args: unknown[]) => () => replayConsole(methodName, args),
  rendererPackageName: 'ink',
  rendererVersion: React.version,
});

/** Whether the program's reconciler is React 19's line, which renders synchronously by its own calls. */
const modern = typeof reconciler.updateContainerSync === 'function';

const noop = (): void => undefined;

/** A root over `rootNode`, legacy (synchronous) or concurrent, on either reconciler line. */
export function createContainer(rootNode: DOMElement, concurrent: boolean, onUncaughtError: (error: unknown) => void = noop): unknown {
  const tag = concurrent ? constants.ConcurrentRoot : constants.LegacyRoot;
  if (modern) return reconciler.createContainer(rootNode, tag, null, false, null, 'id', onUncaughtError, noop, noop, noop);
  return reconciler.createContainer(rootNode, tag, null, false, null, 'id', noop, null);
}

/** Render `element` into the root: at once for a legacy root, scheduled for a concurrent one. */
export function updateContainer(element: unknown, container: unknown, concurrent: boolean): void {
  if (concurrent) {
    reconciler.updateContainer(element, container, null, noop);
    return;
  }
  updateContainerNow(element, container);
}

/** Render `element` into the root synchronously, whatever its mode: ink's unmount and `renderToString`. */
export function updateContainerNow(element: unknown, container: unknown): void {
  if (modern) {
    reconciler.updateContainerSync!(element, container, null, noop);
    reconciler.flushSyncWork!();
    return;
  }
  reconciler.updateContainer(element, container, null, noop);
}

/** Flush whatever synchronous work React has queued, on the line that has the call. */
export const flushSyncWork = (): void => {
  if (modern) reconciler.flushSyncWork!();
};

/** Flush passive effects, where the reconciler exposes the call. */
export const flushPassiveEffects = (): void => {
  (reconciler as unknown as { flushPassiveEffects?: () => boolean }).flushPassiveEffects?.();
};
