import { type Format } from './schema.js';

/**
 * String formats, each as data (spec.md R11) and each with a stated reference (parity.md decision
 * 11): zod, valibot, arktype and ajv-formats agree on almost no value that is not plain, so "an
 * email as the others read it" means nothing. What each accepts is written down, value by value, in
 * formats.test.ts.
 *
 * On a subpath of its own, and each a value of its own: a program carries the formats it imports
 * and no other. That is what the `@__PURE__` marks are for: a bundler keeps a call it cannot see
 * through, and freezing is a call (measured 2026-11-13 with esbuild: without the marks a schema
 * with one format carried all of them). All but the two URL formats are patterns, so `emit` can write them as text; the
 * patterns are anchored and bounded, and take time in proportion to the string.
 *
 * `string({ format: email })`.
 */

/**
 * RFC 3339 §5.6 `full-date`, with the restriction of §5.7 that the day is one the month has: the
 * 29th of February only in a leap year of the Gregorian calendar.
 */
const date = /* @__PURE__ */ Object.freeze({
  name: 'date',
  pattern:
    /^(?:\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8]))|(?:\d\d(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29)$/u,
}) satisfies Format;

/**
 * RFC 3339 §5.6 `date-time`: a full-date, `T`, a time with seconds and any fraction, and `Z` or a
 * numeric offset with its colon. `T` and `Z` may be lower case, as the grammar's note allows. A space
 * for the `T`, a missing offset and `+0200` are not in the grammar.
 *
 * A leap second is accepted where it can be recognised by reading alone: `23:59:60` at `Z` or
 * `±00:00`. At another offset it would stand at another minute, which a pattern cannot work out, and
 * is refused.
 */
const datetime = /* @__PURE__ */ Object.freeze({
  name: 'date-time',
  pattern:
    /^(?:\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8]))|(?:\d\d(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29)[Tt](?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)|23:59:60(?:\.\d+)?(?:[Zz]|[+-]00:00))$/u,
}) satisfies Format;

/**
 * The WHATWG HTML standard's "valid email address" (§4.10.5.1.5), which is the pattern a browser
 * holds `<input type=email>` to. It is a wilful violation of RFC 5322, as the standard says: no
 * quoted local part, no comment, no address literal. It asks for no dot in the domain, so `a@b`
 * passes, and it allows a dot anywhere in the local part.
 */
const email = /* @__PURE__ */ Object.freeze({
  name: 'email',
  pattern: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/u,
}) satisfies Format;

/**
 * RFC 9562 §4: the 8-4-4-4-12 text form, in either case, with a version it defines (1 to 8) and
 * the variant it specifies (the nibble 8, 9, a or b). Also the Nil and the Max UUID (§5.9, §5.10),
 * which have neither. No braces, no `urn:uuid:` prefix.
 */
const uuid = /* @__PURE__ */ Object.freeze({
  name: 'uuid',
  pattern: /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|0{8}-0{4}-0{4}-0{4}-0{12}|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$/u,
}) satisfies Format;

/** RFC 3986 §3.2.2 `IPv4address`: four decimal octets from 0 to 255, with no leading zero. */
const ipv4 = /* @__PURE__ */ Object.freeze({
  name: 'ipv4',
  pattern: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/u,
}) satisfies Format;

/**
 * RFC 3986 §3.2.2 `IPv6address`, which is the text form of RFC 4291 §2.2: eight groups of one to
 * four hex digits, one run of zero groups written `::`, and the last two groups optionally as an
 * IPv4 address. No zone (`%eth0`), which is no part of the address, and no brackets.
 *
 * The pattern is that grammar's nine alternatives, one after the other.
 */
const ipv6 = /* @__PURE__ */ Object.freeze({
  name: 'ipv6',
  pattern:
    /^(?:(?:[0-9a-fA-F]{1,4}:){6}(?:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|::(?:[0-9a-fA-F]{1,4}:){5}(?:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:[0-9a-fA-F]{1,4})?::(?:[0-9a-fA-F]{1,4}:){4}(?:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[0-9a-fA-F]{1,4}:){0,1}[0-9a-fA-F]{1,4})?::(?:[0-9a-fA-F]{1,4}:){3}(?:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[0-9a-fA-F]{1,4}:){0,2}[0-9a-fA-F]{1,4})?::(?:[0-9a-fA-F]{1,4}:){2}(?:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[0-9a-fA-F]{1,4}:){0,3}[0-9a-fA-F]{1,4})?::[0-9a-fA-F]{1,4}:(?:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[0-9a-fA-F]{1,4}:){0,4}[0-9a-fA-F]{1,4})?::(?:[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4})?::[0-9a-fA-F]{1,4}|(?:(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?::)$/u,
}) satisfies Format;

/**
 * RFC 4648 §4: the base 64 alphabet (`A` to `Z`, `a` to `z`, `0` to `9`, `+` and `/`) in groups of
 * four, the last padded with `=`. The empty string is the encoding of no bytes. No line breaks (§3.1)
 * and no missing padding (§3.2); the URL-safe alphabet of §5 is another format.
 */
const base64 = /* @__PURE__ */ Object.freeze({
  name: 'base64',
  pattern: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
}) satisfies Format;

/**
 * RFC 3339 §5.6 `full-time`: hours, minutes and seconds with any fraction, then `Z` or a numeric
 * offset with its colon. It is the time half of `datetime`, and what JSON Schema's `time` format
 * names. A time with no offset is `localTime`. A leap second is accepted where `datetime` accepts
 * it: `23:59:60` at `Z` or `±00:00`.
 */
const time = /* @__PURE__ */ Object.freeze({
  name: 'time',
  pattern: /^(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)|23:59:60(?:\.\d+)?(?:[Zz]|[+-]00:00))$/u,
}) satisfies Format;

/**
 * RFC 3339 §5.6 `partial-time`: `hh:mm:ss` with any fraction, and no offset, which is ISO 8601's
 * local time in its extended format with seconds. It is what zod and valibot call an ISO time. No
 * leap second: with no offset there is no telling whether the minute had one.
 */
const localTime = /* @__PURE__ */ Object.freeze({
  name: 'local-time',
  pattern: /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?$/u,
}) satisfies Format;

/**
 * One or more of RFC 5234's `HEXDIG` (appendix B.1), in either case, as ABNF reads its own
 * letters: the digits of a number written in base 16, or of bytes written two digits each (RFC 4648
 * §8). No `0x` in front, and not the empty string, which is no number.
 */
const hex = /* @__PURE__ */ Object.freeze({ name: 'hex', pattern: /^[0-9a-fA-F]+$/u }) satisfies Format;

/**
 * A host name as RFC 1123 §2.1 has it: RFC 952's labels of letters, digits and hyphens joined by
 * dots, a label neither starting nor ending with a hyphen, and a digit allowed first. A label is
 * at most 63 characters and the whole name at most 253 (RFC 1035 §2.3.4). One label is a host
 * name, so `localhost` passes. No trailing dot, no underscore, and no character outside ASCII: an
 * internationalised name is written in its `xn--` form.
 */
const hostname = /* @__PURE__ */ Object.freeze({
  name: 'hostname',
  pattern: /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/u,
}) satisfies Format;

/**
 * What the WHATWG URL parser removes before it reads: a space or a control at either end, and a
 * tab or a line break anywhere. A string it has to cut first is not the URL it then parses.
 */
const CUT = /^[\x00-\x20]|[\x00-\x20]$|[\t\n\r]/u;

const isUrl = (text: string): boolean => !CUT.test(text) && URL.canParse(text);

/**
 * The WHATWG URL standard: a string its parser reads with no base URL, so an absolute URL, and
 * that it does not have to cut first. **Any scheme**: `mailto:`, `urn:`, `data:` and `javascript:`
 * pass, as they do in zod, valibot and arktype; use `httpUrl` for a link. The parser is the
 * platform's (`URL.canParse`, in every Node this package supports and every current browser), so
 * what it forgives is forgiven here: a space in a path, a host that is not ASCII.
 *
 * A function, not a pattern: `emit` cannot write it as text, and `emitWith` hands it over.
 */
const url = /* @__PURE__ */ Object.freeze({ name: 'url', test: isUrl }) satisfies Format;

/** `http://` or `https://` in either case, then the first character of a host. */
const HTTP = /^https?:\/\/[^\s/?#\\]/iu;

const isHttpUrl = (text: string): boolean => HTTP.test(text) && isUrl(text);

/** The same, with the scheme `http` or `https` and a host: what may be offered as a link. */
const httpUrl = /* @__PURE__ */ Object.freeze({ name: 'http-url', test: isHttpUrl }) satisfies Format;

export { base64, date, datetime, email, hex, hostname, httpUrl, ipv4, ipv6, localTime, time, url, uuid };
