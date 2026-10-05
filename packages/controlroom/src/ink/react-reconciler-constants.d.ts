/** The constants `react-reconciler` publishes beside its factory: root tags and event priorities. */
declare module 'react-reconciler/constants.js' {
  export const LegacyRoot: number;
  export const ConcurrentRoot: number;
  export const DefaultEventPriority: number;
  export const NoEventPriority: number | undefined;
  const constants: { LegacyRoot: number; ConcurrentRoot: number; DefaultEventPriority: number; NoEventPriority?: number };
  export default constants;
}
