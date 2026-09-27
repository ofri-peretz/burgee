#!/usr/bin/env tsx
/**
 * The two external checkers N10 measures the floor against, pinned by version and by digest.
 *
 *   npx tsx benchmarks/floor-tools.ts     download, verify and unpack both into benchmarks/.tools/
 *
 * **Neither is on npm, so neither can be a devDependency.** `cli-agent-lint` is a Go binary
 * released on GitHub; `clispec` is a Rust binary released on GitHub and crates.io. The npm
 * package called `clispec` (0.2.6, "CLI intelligence compiler") is an unrelated project by a
 * different author, and pinning it would have measured the floor against the wrong tool —
 * found on 2026-09-24 by checking before installing (D-149).
 *
 * So the pin lives here, in the same spirit as an exact version in `package.json`: one
 * version per tool, and the SHA-256 of every archive this script will accept, copied from
 * the release's own asset digests. A release that is re-uploaded under the same tag is a
 * different binary, and this refuses it rather than measuring with it.
 *
 * Both run offline: neither links an HTTP client (`clispec`'s `Cargo.toml` and
 * `cli-agent-lint`'s `go.mod` at the pinned tags), and both only spawn the target they are
 * pointed at. The download is the only network this axis ever does, and it happens here,
 * before the measurement, not during it.
 */
import { spawnSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BENCH_ROOT = dirname(fileURLToPath(import.meta.url));
/** Gitignored. A measurement tool is not source, and a binary in git is 1.5 MB of it. */
export const TOOLS_DIR = join(BENCH_ROOT, '.tools');

export type ToolId = 'clispec' | 'cli-agent-lint';

/** `<os>-<arch>` as Node spells them. Only the four a runner or a laptop here can be. */
export type Platform = 'linux-x64' | 'linux-arm64' | 'darwin-x64' | 'darwin-arm64';

export interface Archive {
  url: string;
  /** Hex SHA-256 of the archive, from the GitHub release asset's own `digest`. */
  sha256: string;
}

export interface Tool {
  id: ToolId;
  version: string;
  /** Where the checklist is published — what the page links to. */
  home: string;
  licence: string;
  /** The executable's name inside the archive; both put it at the archive root. */
  binary: string;
  archives: Readonly<Record<Platform, Archive>>;
}

const CLISPEC = 'https://github.com/rvben/clispec-cli/releases/download/v0.3.0';
const CAL = 'https://github.com/Camil-H/cli-agent-lint/releases/download/v0.3.5';

export const TOOLS: readonly Tool[] = [
  {
    id: 'clispec',
    version: '0.3.0',
    home: 'https://clispec.dev',
    licence: 'MIT (scorer); CC BY 4.0 (spec)',
    binary: 'clispec',
    archives: {
      'linux-x64': { url: `${CLISPEC}/clispec-v0.3.0-x86_64-unknown-linux-gnu.tar.gz`, sha256: '0507415598c04a65dd6d8212d7774040e0f66dcd465589243b617351dc620d6b' },
      'linux-arm64': { url: `${CLISPEC}/clispec-v0.3.0-aarch64-unknown-linux-gnu.tar.gz`, sha256: '6d701555fb5b934417244e2de82d6e55bcb0a74f00ddeda41c17b7d3b9a9f93f' },
      'darwin-x64': { url: `${CLISPEC}/clispec-v0.3.0-x86_64-apple-darwin.tar.gz`, sha256: '9497d6f3f0b9da674957b357f292ff0f960b986c30f42ef84da4a30c682a494e' },
      'darwin-arm64': { url: `${CLISPEC}/clispec-v0.3.0-aarch64-apple-darwin.tar.gz`, sha256: 'bb20da77f5a6810e53a6c41fbb5e0ca29772dd8fc4bb23bb16a0519d94c394ff' },
    },
  },
  {
    id: 'cli-agent-lint',
    version: '0.3.5',
    home: 'https://github.com/Camil-H/cli-agent-lint',
    licence: 'MIT',
    binary: 'cli-agent-lint',
    archives: {
      'linux-x64': { url: `${CAL}/cli-agent-lint_0.3.5_linux_amd64.tar.gz`, sha256: 'e8546002261662af456460272351f0b08fcfee2af95360e2cc5bec0b33bba4b1' },
      'linux-arm64': { url: `${CAL}/cli-agent-lint_0.3.5_linux_arm64.tar.gz`, sha256: 'dac6e44b8a2d39414231eb767b030be3576187a9cbdb2c5e93369854bf9266a1' },
      'darwin-x64': { url: `${CAL}/cli-agent-lint_0.3.5_darwin_amd64.tar.gz`, sha256: 'b66ccdbddc5d11723dc0f3759f219bb41e163fe0d1ad4d3883fcb3c66231decf' },
      'darwin-arm64': { url: `${CAL}/cli-agent-lint_0.3.5_darwin_arm64.tar.gz`, sha256: '6dd4b3b664be7c611160516f092401c8effa60c14bdb3b57ad05d9533437f9af' },
    },
  },
];

/** Two archives of ~1.5 MB each; a minute is a stalled connection, not a slow one. */
const DOWNLOAD_TIMEOUT_MS = 60_000;
/** Enough of a digest to recognise in a log line. */
const DIGEST_PREFIX = 12;

const PLATFORMS: readonly Platform[] = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];

/** This machine's platform, or `undefined` for one no pinned archive exists for. */
export function platform(os: string = process.platform, arch: string = process.arch): Platform | undefined {
  const key = `${os}-${arch}`;
  return PLATFORMS.find((p) => p === key);
}

/** Where a tool's binary lands. Versioned, so a bumped pin never runs the previous binary. */
export const toolPath = (tool: Tool): string => join(TOOLS_DIR, `${tool.id}-${tool.version}`, tool.binary);

/** The digest check, separated so a test can hand it a wrong archive and watch it refuse. */
export function verify(bytes: Uint8Array, archive: Archive): void {
  const actual = createHash('sha256').update(bytes).digest('hex');
  // The pinned digest is public, so timing is not the concern — but the comparison costs
  // nothing either way, and one spelling of "compare two digests" is easier to audit.
  const same = actual.length === archive.sha256.length && timingSafeEqual(Buffer.from(actual), Buffer.from(archive.sha256));
  if (!same) {
    throw new Error(`${archive.url}: sha256 ${actual} is not the pinned ${archive.sha256} — refusing to measure with a binary nobody pinned`);
  }
}

async function install(tool: Tool, where: Platform): Promise<string> {
  const target = toolPath(tool);
  if (existsSync(target)) return `${tool.id} ${tool.version} already at ${target}`;
  const archive = tool.archives[where];
  const response = await fetch(archive.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${archive.url}: HTTP ${String(response.status)}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  verify(bytes, archive);
  const scratch = mkdtempSync(join(tmpdir(), `${tool.id}-`));
  try {
    const tarball = join(scratch, 'archive.tar.gz');
    writeFileSync(tarball, bytes);
    const untar = spawnSync('tar', ['-xzf', tarball, '-C', scratch, tool.binary], { encoding: 'utf8' });
    if (untar.status !== 0) throw new Error(`tar could not extract ${tool.binary}: ${untar.stderr}`);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(join(scratch, tool.binary), target);
    const EXECUTABLE = 0o755;
    chmodSync(target, EXECUTABLE);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return `${tool.id} ${tool.version} → ${target} (sha256 ${archive.sha256.slice(0, DIGEST_PREFIX)}…)`;
}

export async function main(): Promise<number> {
  const where = platform();
  if (where === undefined) {
    process.stderr.write(`no pinned archive for ${process.platform}-${process.arch}; the floor axis runs on linux and darwin, x64 and arm64\n`);
    return 1;
  }
  const lines = await Promise.all(TOOLS.map((tool) => install(tool, where)));
  for (const line of lines) process.stdout.write(`${line}\n`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
