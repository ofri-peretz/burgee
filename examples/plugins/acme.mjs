// One plugin object, nine layers. A company's CLI conventions in a single file: brand
// colours, a spinner, a terminal quirk, a config source, where its tools live, what to
// flush on exit, a prompt of its own, a terminal capability and a command every CLI
// gets. Each package reads its own key and ignores the rest, so the same object
// registers into any subset of the family that is installed.
//
// Check it against any layer: `npx roundel check examples/plugins/acme.mjs`, and the
// same for flagstaff, linegauge, paratext, seniority, bellpull, closeout, caique and
// `npx burgee check`. `scripts/plugin-example-lock.test.ts` runs all nine.
export default {
  name: 'acme',
  contract: 1,

  // roundel — the brand, as semantic tokens every styled line reads.
  tokens: { ok: '#1a7f37', error: '#cf222e', hint: '#0969da' },

  // flagstaff — a spinner, with the line a pipe or an agent prints instead.
  spinners: { acme: { frames: ['◐', '◓', '◑', '◒'], interval: 100, static: '◐' } },

  // linegauge — the Nerd Font glyphs this company's prompt draws two columns wide.
  widths: { powerline: { ranges: [[0xe0a0, 0xe0a3], [0xe0b0, 0xe0b3]], columns: 2, why: 'Nerd Font powerline glyphs render wide in the company terminal profile' } },

  // paratext — a terminal capability, with what prints when the terminal lacks it.
  capabilities: { beep: { name: 'beep', osc: 'BEL', when: { tty: true }, encode: '\u0007', fallback: '' } },

  // seniority — a config layer between the flag (0) and the declared default (40).
  sources: { vault: { rank: 25, read: () => undefined, location: 'vault://acme/cli' } },

  // bellpull — where the company's pinned toolchain lives, searched before PATH.
  resolvers: { asdf: { rank: -10, paths: ['{ASDF_DATA_DIR}/shims'], when: { envAny: ['ASDF_DATA_DIR'] } } },

  // closeout — flush telemetry before the process exits, whatever ended it.
  handlers: [{ name: 'flush-telemetry', phase: 'flush', run() {} }],

  // caique — a prompt kind of the company's own, with its non-interactive projection.
  widgets: { rating: { static: () => 'rate 1-5', sample: { running: {}, done: {} } } },

  // burgee — a command every company CLI gets, declared exactly as a program's own.
  commands: [{ path: ['doctor'], description: 'Check this machine against the company toolchain', options: {}, effects: 'read_only', run: () => ({ ok: true }) }],
};
