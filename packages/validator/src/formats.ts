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

/**
 * RFC 4648 §5, base 64 with the URL and filename safe alphabet (`-` and `_` for `+` and `/`), and
 * with no padding, as §3.2 allows where the length is known and as JWT (RFC 7515 §2) writes it. So
 * `=` is refused, and so is a length that leaves one character over, which encodes no whole byte.
 */
const base64url = /* @__PURE__ */ Object.freeze({ name: 'base64url', pattern: /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/u }) satisfies Format;

/** A cuid (version 1, deprecated by its author): `c` and then 24 lower-case letters and digits, 25 in all. */
const cuid = /* @__PURE__ */ Object.freeze({ name: 'cuid', pattern: /^c[0-9a-z]{24}$/u }) satisfies Format;

/** A cuid2: a lower-case letter, then lower-case letters and digits, from 2 to 32 in all (the library's own bounds; 24 is its default). */
const cuid2 = /* @__PURE__ */ Object.freeze({ name: 'cuid2', pattern: /^[a-z][0-9a-z]{1,31}$/u }) satisfies Format;

/**
 * RFC 3339 Appendix A `duration`, which is what JSON Schema's `duration` format names: `P`, then
 * years, months and days, a `T` with hours, minutes and seconds, or weeks alone; whole numbers, no
 * sign. The grammar is strict about order and about gaps: a minute may follow an hour, not skip it,
 * so `PT1H1S` and `P1Y1D` are refused, `P1DT2H` and `PT36H` accepted.
 */
const duration = /* @__PURE__ */ Object.freeze({
  name: 'duration',
  pattern: /^P(?:(?:\d+D|\d+M(?:\d+D)?|\d+Y(?:\d+M(?:\d+D)?)?)(?:T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S))?|T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S)|\d+W)$/u,
}) satisfies Format;

/**
 * One or more emoji of Unicode's recommended set (UTS #51, `RGI_Emoji`), as the engine's own Unicode
 * tables have them: a flag, a family and a skin tone are each one. So `"123"` is refused, which a
 * test of single code points would let through, since a digit is an emoji component.
 */
const emoji = /* @__PURE__ */ Object.freeze({ name: 'emoji', pattern: /* @__PURE__ */ new RegExp('^\\p{RGI_Emoji}+$', 'v') }) satisfies Format;

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
    // Stryker disable next-line BlockStatement: equivalent, a format holds only where its test returns true, and an empty block returns undefined
  } catch {
    return false;
  }
};

/** A string that is a JSON text (RFC 8259 §2), as `JSON.parse` reads one: any JSON value, white space around it allowed. A test, so `emitWith` hands it over. */
const json = /* @__PURE__ */ Object.freeze({ name: 'json', test: isJson }) satisfies Format;

const B64URL = /^[A-Za-z0-9_-]*$/u;

/** Base 64 writes three bytes as four characters; a segment one character past a whole group encodes no whole byte. */
const GROUP = 4;
/** The segments of a JWS in its compact form: header, payload, signature. */
const SEGMENTS = 3;
/** The versions RFC 9562 §4.2 defines run from 1 to 8. */
const LAST_VERSION = 8;

/**
 * The bytes a base64url segment holds, read as UTF-8: the empty string, which is no JSON, where
 * they are not UTF-8. The segment is one `isJwt` has already held to the alphabet and the length,
 * and `atob` reads base 64 without its padding (the forgiving decode of the HTML standard).
 */
const decoded = (segment: string): string => {
  const binary = atob(segment.replaceAll('-', '+').replaceAll('_', '/'));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (unit) => unit.codePointAt(0) as number));
    // Stryker disable next-line BlockStatement: equivalent, `undefined` is no JSON text either
  } catch {
    // Stryker disable next-line StringLiteral: equivalent, any text that is not JSON refuses the header the same way
    return '';
  }
};

/**
 * Whether a header is a JSON object with an `alg` that is a string (RFC 7515 §4.1.1: it must be
 * there). Nothing in JSON but an object has a member, so asking for the member is asking for both.
 */
const isHeader = (text: string): boolean => isJson(text) && typeof (JSON.parse(text) as { readonly alg?: unknown } | null)?.alg === 'string';

/**
 * A JWS in its compact form (RFC 7515 §7.1), which is what a JWT is written as: three base64url
 * segments with no padding, joined by dots, the first a JSON object with a string `alg`. The payload
 * and the signature are not read: the signature is empty for `alg: none`, and the payload need not be
 * JSON. Whether the token is signed by anyone you trust is not a format's to say.
 */
const isJwt = (text: string): boolean => {
  const parts = text.split('.');
  return parts.length === SEGMENTS && parts.every((part) => B64URL.test(part) && part.length % GROUP !== 1) && isHeader(decoded(parts[0] as string));
};

const jwt = /* @__PURE__ */ Object.freeze({ name: 'jwt', test: isJwt }) satisfies Format;

/** A Nano ID of the library's defaults: 21 characters of its URL-safe alphabet, `A`–`Z`, `a`–`z`, `0`–`9`, `_` and `-`. */
const nanoid = /* @__PURE__ */ Object.freeze({ name: 'nanoid', pattern: /^[A-Za-z0-9_-]{21}$/u }) satisfies Format;

/**
 * A ULID (github.com/ulid/spec): 26 characters of Crockford's base 32, which has no `I`, `L`, `O` or
 * `U`. Read in either case, as the spec says it is. The first is at most `7`: 26 characters hold 130
 * bits, and a ULID is 128.
 */
const ulid = /* @__PURE__ */ Object.freeze({ name: 'ulid', pattern: /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/u }) satisfies Format;

/** The UUID versions RFC 9562 defines. */
// eslint-disable-next-line conventions/no-magic-numbers -- the versions themselves, as RFC 9562 §4.2 numbers them
type UuidVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * A UUID of one version (RFC 9562 §4.2): the `uuid` format with that digit where the version stands,
 * and the RFC's variant. `uuidVersion(4)` refuses a version-1 UUID, and the Nil and Max UUIDs, which
 * have no version.
 */
const uuidVersion = (version: UuidVersion): Format => {
  if (!Number.isInteger(version) || version < 1 || version > LAST_VERSION) {
    throw new TypeError(`there is no UUID version ${typeof version === 'number' ? String(version) : `that is a value of the type ${typeof version}`}. fix: name a version from 1 to 8 (RFC 9562 §4.2)`);
  }
  // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the one part decided at run time is a version just held to the digits 1 to 8
  return Object.freeze({ name: `uuid-v${String(version)}`, pattern: new RegExp(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${String(version)}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`, 'u') });
};

const isRegex = (text: string): boolean => {
  try {
    // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the pattern is only compiled, to ask whether it is one, and never run
    new RegExp(text, 'u');
    return true;
    // Stryker disable next-line BlockStatement: equivalent, a format holds only where its test returns true, and an empty block returns undefined
  } catch {
    return false;
  }
};

/**
 * A string that is itself a regular expression, read as ECMA-262 reads one under the `u` flag,
 * which is how JSON Schema's `regex` format and its `pattern` keyword read them. So `^a+$` passes and
 * `(` does not; neither does `\-`, which only a pattern without the flag reads.
 */
const regex = /* @__PURE__ */ Object.freeze({ name: 'regex', test: isRegex }) satisfies Format;

export { base64, base64url, cuid, cuid2, date, datetime, duration, email, emoji, hex, hostname, httpUrl, ipv4, ipv6, json, jwt, localTime, nanoid, regex, time, ulid, url, uuid, uuidVersion, type UuidVersion };
