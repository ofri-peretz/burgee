/**
 * R11 — the `react-reconciler` host config: React's own reconciler, driving the host tree in
 * `dom.ts`. One config serves both reconciler lines a program may bring: 0.29 (React 18, with
 * `prepareUpdate` and a payload argument) and 0.31+ (React 19, with update priorities and
 * `commitUpdate(instance, type, …)`). Each member only one line reads is harmless to the other.
 */
import { type Reconciler } from 'react-reconciler';

import {
  appendChildNode,
  createNode,
  createTextNode,
  type DOMElement,
  type DOMNode,
  type ElementName,
  insertBeforeNode,
  removeChildNode,
  setHidden,
  setStyle,
  setTextNodeValue,
  type Styles,
  type TextNode,
  type Transformer,
} from './dom.js';
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
  for (const key of Object.keys(after ?? {})) {
    if (after![key] !== before[key]) {
      changed[key] = after![key];
      isChanged = true;
    }
  }
  return isChanged ? changed : undefined;
}

let currentUpdatePriority = constants.NoEventPriority ?? 0;
let currentRootNode: DOMElement | undefined;

function applyProp(node: DOMElement, key: string, value: unknown, rootNode: DOMElement | undefined): void {
  if (key === 'children') return;
  if (key === 'style') setStyle(node, value as Styles | undefined);
  else if (key === 'internal_transform') node.internal_transform = value as Transformer | undefined;
  else if (key === 'internal_static') {
    node.internal_static = true;
    if (rootNode !== undefined) {
      currentRootNode = rootNode;
      rootNode.isStaticDirty = true;
      rootNode.staticNode = node;
    }
  } else if (key === 'internal_accessibility') node.internal_accessibility = value as DOMElement['internal_accessibility'] & object;
  else node.attributes[key] = value;
}

function commitUpdate(node: DOMElement, oldProps: Props, newProps: Props): void {
  if (currentRootNode !== undefined && node.internal_static === true) currentRootNode.isStaticDirty = true;
  const props = diff(oldProps, newProps);
  if (props === undefined) return;
  for (const [key, value] of Object.entries(props)) applyProp(node, key, value, undefined);
}

const resetAfterCommit = (rootNode: DOMElement): void => {
  rootNode.onComputeLayout?.();
  // <Static> children render once and are then removed, so a commit that added some is
  // written at once rather than waiting on the throttle, before the next commit erases them.
  if (rootNode.isStaticDirty === true) {
    rootNode.isStaticDirty = false;
    rootNode.onImmediateRender?.();
    return;
  }
  rootNode.onRender?.();
};

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
  createInstance(originalType: ElementName, props: Props, rootNode: DOMElement, hostContext: HostContext): DOMElement {
    if (hostContext.isInsideText && originalType === 'ink-box') throw new Error('<Box> can’t be nested inside <Text> component');
    const node = createNode(originalType === 'ink-text' && hostContext.isInsideText ? 'ink-virtual-text' : originalType);
    for (const [key, value] of Object.entries(props)) applyProp(node, key, value, rootNode);
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
  hideInstance: (node: DOMElement) => setHidden(node, true),
  unhideInstance: (node: DOMElement) => setHidden(node, false),
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
  prepareScopeUpdate() {},
  getInstanceFromScope: () => null,
  appendChildToContainer: appendChildNode,
  insertInContainerBefore: insertBeforeNode,
  removeChildFromContainer: (node: DOMElement, child: DOMNode) => removeChildNode(node, child),
  removeChild: (node: DOMElement, child: DOMNode) => removeChildNode(node, child),
  // React 18 computes a payload first and hands it to `commitUpdate` as the second argument;
  // React 19 drops `prepareUpdate` and passes the type there instead.
  prepareUpdate: () => true,
  commitUpdate(node: DOMElement, ...rest: unknown[]) {
    if (typeof rest[0] === 'string') commitUpdate(node, rest[1] as Props, rest[2] as Props);
    else commitUpdate(node, rest[2] as Props, rest[3] as Props);
  },
  commitTextUpdate: (node: TextNode, _old: string, text: string) => setTextNodeValue(node, text),
  // React 18's priority hook, and React 19's three.
  getCurrentEventPriority: () => constants.DefaultEventPriority,
  setCurrentUpdatePriority(priority: number) {
    currentUpdatePriority = priority;
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () => (currentUpdatePriority === (constants.NoEventPriority ?? 0) ? constants.DefaultEventPriority : currentUpdatePriority),
  maySuspendCommit: () => true,
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
  waitForCommitToBeReady: () => null,
  rendererPackageName: 'controlroom',
  rendererVersion: '0.0.1',
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
  if (modern) {
    reconciler.updateContainerSync!(element, container, null, noop);
    reconciler.flushSyncWork!();
    return;
  }
  reconciler.updateContainer(element, container, null, noop);
}
