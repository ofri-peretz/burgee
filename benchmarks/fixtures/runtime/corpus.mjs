/**
 * The mixed text the linegauge and flagstaff workloads measure: what a CLI actually prints.
 * ASCII, CJK, emoji (a ZWJ family, a flag, a skin tone), SGR-styled runs, combining marks,
 * and an OSC 8 hyperlink — seven shapes, repeated to 1,000 lines, each numbered so no two
 * strings are identical and nothing can be cached by value.
 */
const BASE = [
  'The quick brown fox jumps over the lazy dog',
  '日本語のテキストと漢字の混在した文字列です',
  'emoji 👨‍👩‍👧‍👦 family 🏳️‍🌈 flag 👍🏽 thumbs',
  '\u001B[31mred\u001B[39m \u001B[1mbold\u001B[22m \u001B[4;32munder green\u001B[0m plain',
  'café naïve Z̤͔ͧ̑̓ä͖̭̈̇lͮ̒ͫǫ̗ combining',
  'mixed ASCII 中文 한국어 ✨ \u001B[36mcyan 🚀\u001B[39m end',
  '\u001B]8;;https://example.com\u0007link\u001B]8;;\u0007 after link',
];
const LINES = 1000;
const PARAGRAPH_LINES = 50;

export const corpus = Array.from({ length: LINES }, (_, i) => `${BASE[i % BASE.length]} #${String(i)}`);
/** One 2.5 KB paragraph, for the hard-wrap case. */
export const paragraph = corpus.slice(0, PARAGRAPH_LINES).join(' ');
