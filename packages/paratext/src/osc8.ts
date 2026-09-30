/**
 * The OSC 8 record on its own, so `paratext/terminal-link` can emit a hyperlink without reaching
 * the template renderer `./link` uses for its fallback. terminal-link renders the record's
 * `encode` once at load (B5), so the renderer was 1,700 B of its graph it never called.
 * `./link` and the registry's built-ins re-export this same object.
 */
import { type Capability } from './capability.js';

const BEL = '';
const OSC = ']';

/**
 * OSC 8 — a hyperlink. The widest support in this layer, and unusually semi-detectable: VTE
 * publishes its version and Windows Terminal sets a session variable.
 *
 * The fallback is `text (url)`, not bare text: a link whose destination vanishes in a pipe
 * has lost the half that mattered. The optional group makes a link with no url just its text.
 */
export const LINK: Capability = {
  name: 'link',
  osc: 8,
  when: { tty: true, termProgram: ['iTerm.app', 'WezTerm', 'ghostty', 'vscode', 'Hyper', 'Apple_Terminal'], envAny: ['VTE_VERSION', 'WT_SESSION'] },
  encode: `${OSC}8;;{url}${BEL}{text}${OSC}8;;${BEL}`,
  fallback: '{text}[ ({url})]',
};
