/**
 * Which native core a machine needs, as napi-rs names it: `<platform>-<arch>[-gnu|-musl|-msvc]`.
 * The tag names the bundled core (`binding/oxmutate.<tag>.node`), the platform package
 * (`oxmutate-<tag>`, `npm/<tag>`) and the release matrix leg, so all three agree by construction.
 * Pure: the machine is passed in, so every branch is testable on any one machine.
 */

/** What decides the tag: `process.platform`, `process.arch`, and whether the C library is glibc. */
export interface Machine {
  platform: string;
  arch: string;
  /** glibc's runtime version from `process.report`, absent on musl (and off Linux). */
  glibc?: string | undefined;
}

/** `darwin-arm64`, `linux-x64-gnu`, `linux-x64-musl`, `win32-x64-msvc`, … */
export function platformTag({ platform, arch, glibc }: Machine): string {
  if (platform === 'win32') return `win32-${arch}-msvc`;
  if (platform === 'linux') return `linux-${arch}-${glibc ? 'gnu' : 'musl'}`;
  return `${platform}-${arch}`;
}

/** The npm package that carries the tag's core once the platform packages publish. */
export function platformPackage(machine: Machine): string {
  return `oxmutate-${platformTag(machine)}`;
}

/**
 * The files to try, in order, under each `binding/` directory: the bundled release core for this
 * tag, then the development build `scripts/copy-binding.mjs` writes (`<platform>-<arch>`, which is
 * the same name on macOS).
 */
export function bindingNames(machine: Machine): string[] {
  return [...new Set([`oxmutate.${platformTag(machine)}.node`, `oxmutate.${machine.platform}-${machine.arch}.node`])];
}
