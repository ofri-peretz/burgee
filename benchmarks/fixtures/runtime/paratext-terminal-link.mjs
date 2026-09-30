/** paratext/terminal-link ÷ terminal-link: 10k links, with FORCE_HYPERLINK=1 so both emit OSC 8. */
import assert from 'node:assert/strict';

import ours from 'paratext/terminal-link';
import terminalLink from 'terminal-link';

const CALLS = 10_000;

const links = (link) => {
  let bytes = 0;
  for (let i = 0; i < CALLS; i++) bytes += link(`x${String(i)}`, `https://e.com/${String(i)}`).length;
  return bytes;
};

export default {
  n: 60,
  check() {
    const a = ours('a', 'https://e.com');
    assert.equal(a, terminalLink('a', 'https://e.com'));
    assert.ok(a.includes('\u001B]8;;'), 'FORCE_HYPERLINK=1 must make both emit a hyperlink, or this times the fallback');
    assert.equal(links(ours), links(terminalLink));
  },
  ours: () => links(ours),
  theirs: () => links(terminalLink),
};
