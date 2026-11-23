import { killSiblings } from './kill.js';

/** Does nothing unarmed. Mutated so the condition holds, it takes its worker down, and its siblings with it. */
export const hog = (armed: boolean): void => {
  if (armed) killSiblings();
};
