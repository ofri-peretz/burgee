/**
 * paratext — name reserved; the OSC layer of the family. The intent and design are at
 * .sdlc/intents/paratext/ in the burgee repository, both at draft. Until they are approved
 * and built, this entry exports only its own name, so that importing it costs nothing and
 * promises nothing.
 *
 * The boundary it will own: **OSC** — `ESC ]` — the escape class that addresses the terminal
 * *program* rather than the character grid. Hyperlinks, inline images, the window title, the
 * clipboard, desktop notifications, the working directory, and the bell. Its siblings own the
 * rest: SGR is roundel's, grid-moving CSI is flagstaff's, and the CSI that must be undone on
 * exit is closeout's.
 */
export const name = 'paratext' as const;
