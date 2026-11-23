/**
 * R5: the consumer harness. Installs a framework at a pinned version into a temporary folder (never
 * the lockfile), drops a generator's output beside it, type-checks it under TypeScript 5.9, 6.0
 * and 7.0, and boots it: the boot exits 0 only when the app starts and serves one route.
 *
 *   npx tsx benchmarks/apicontract/consumers.ts --framework mcp --output <dir>
 *   npx tsx benchmarks/apicontract/consumers.ts --framework mcp --spec <file> [--target mcp]
 *   npx tsx benchmarks/apicontract/consumers.ts --framework hono --output <dir> --route /pets
 *
 * `--spec` generates the output first with this checkout's built `apicontract` (`--target`
 * defaults to the framework's generator). Each framework names the module it boots from the
 * output, the export it reads, and what "serves one route" means for it:
 *
 * - nest: `app.module.ts` exports `AppModule`; NestFactory starts it, and GET `--route` answers below 500 and not 404.
 * - hono: `index.ts` exports `app`; `app.request(--route)` answers below 500 and not 404.
 * - msw: `handlers.ts` exports `handlers`; with them installed, GET `--route` answers below 500 and not 404.
 * - tanstack-query: type-check only — hooks have no server to boot.
 * - mcp: `server.ts` (stdio) is started as a child process and answers `tools/list` with as many tools as `tools.ts` declares.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { spawnSync } from '../spawn.js';

import { errorLine, parseFlags, TYPESCRIPTS, type TsKey } from './corpus-lib.js';
import { bin, install } from './install.js';

const REPO = path.resolve(import.meta.dirname, '../..');
const APICONTRACT_DIST = path.join(REPO, 'packages', 'contractdiff', 'dist');
const BOOT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 16 * 1024 * 1024;
/** At most this many tsc errors are kept per compiler: enough to see the pattern. */
const ERRORS_KEPT = 10;
const NODE_TYPES = '@types/node@24.19.2';

interface Framework {
  /** Pinned: a bump is a reviewed PR (intent constraint 2). */
  readonly packages: readonly string[];
  /** The generator `--spec` runs when `--target` is not given. */
  readonly generator: string;
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  /** Source of `boot.ts`, run after the output compiles; `undefined` when there is nothing to boot. */
  readonly boot: ((route: string) => string) | undefined;
}

const ESM = { module: 'nodenext', moduleResolution: 'nodenext' };

export const FRAMEWORKS: Readonly<Record<string, Framework>> = {
  nest: {
    packages: ['@nestjs/common@12.5.1', '@nestjs/core@12.5.1', '@nestjs/platform-express@12.5.1', 'reflect-metadata@0.2.2', 'rxjs@7.8.2'],
    generator: 'nest',
    compilerOptions: { ...ESM, experimentalDecorators: true, emitDecoratorMetadata: true },
    boot: (route) => `import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.js';
const app = await NestFactory.create(AppModule, { logger: false });
await app.listen(0);
const status = (await fetch(new URL(${JSON.stringify(route)}, await app.getUrl()))).status;
await app.close();
if (status >= 500 || status === 404) throw new Error(\`GET ${route} answered \${status}\`);
console.log(JSON.stringify({ route: ${JSON.stringify(route)}, status }));`,
  },
  hono: {
    packages: ['hono@4.13.19'],
    generator: 'hono',
    compilerOptions: ESM,
    boot: (route) => `import { app } from './app/index.js';
const status = (await app.request(${JSON.stringify(route)})).status;
if (status >= 500 || status === 404) throw new Error(\`GET ${route} answered \${status}\`);
console.log(JSON.stringify({ route: ${JSON.stringify(route)}, status }));`,
  },
  msw: {
    packages: ['msw@3.0.7'],
    generator: 'msw',
    compilerOptions: { ...ESM, lib: ['es2023', 'dom'] },
    boot: (route) => `import { setupServer } from 'msw/node';
import { handlers } from './app/handlers.js';
const server = setupServer(...handlers);
server.listen({ onUnhandledRequest: 'error' });
const status = (await fetch(new URL(${JSON.stringify(route)}, 'http://api.test'))).status;
server.close();
if (status >= 500 || status === 404) throw new Error(\`GET ${route} answered \${status}\`);
console.log(JSON.stringify({ route: ${JSON.stringify(route)}, status }));`,
  },
  'tanstack-query': {
    packages: ['@tanstack/react-query@5.108.0', 'react@19.3.1', '@types/react@19.3.0'],
    generator: 'tanstack-query',
    compilerOptions: { ...ESM, jsx: 'react-jsx', lib: ['es2023', 'dom'] },
    boot: undefined,
  },
  mcp: {
    packages: ['@modelcontextprotocol/sdk@1.32.2'],
    generator: 'mcp',
    compilerOptions: ESM,
    boot: () => `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tools } from './app/tools.js';
const client = new Client({ name: 'apicontract-consumers', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('./app/server.js', import.meta.url).pathname] }));
const listed = await client.listTools();
await client.close();
if (listed.tools.length !== tools.length) throw new Error(\`tools/list answered \${listed.tools.length} tools, tools.ts declares \${tools.length}\`);
console.log(JSON.stringify({ route: 'tools/list', tools: listed.tools.length }));`,
  },
};

/** Generates `target` from `spec` with this checkout's built apicontract, through its public CLI. */
function generate(spec: string, target: string, out: string): void {
  if (!existsSync(path.join(APICONTRACT_DIST, 'bin.js'))) throw new Error('apicontract is not built. fix: npx turbo run build --filter=apicontract');
  mkdirSync(out, { recursive: true });
  const config = path.join(out, '..', 'contractdiff.config.json');
  // The config takes paths relative to itself, so the spec is copied in beside it.
  const input = `spec${path.extname(spec)}`;
  cpSync(spec, path.join(out, '..', input));
  writeFileSync(config, JSON.stringify({ input, targets: { [target]: { generator: target, out: path.basename(out) } } }));
  const ran = spawnSync(process.execPath, [path.join(APICONTRACT_DIST, 'bin.js'), 'gen', '--config', config, '--force'], { cwd: path.dirname(config), encoding: 'utf8' });
  if (ran.status !== 0) throw new Error(`apicontract gen ${target} failed: ${`${ran.stderr}\n${ran.stdout}`.trim()}`);
}

export interface ConsumerReading {
  readonly framework: string;
  readonly packages: readonly string[];
  readonly files: number;
  readonly typecheck: Record<TsKey, { ok: boolean; errors: string[] }>;
  readonly boot: { ok: boolean; detail: string } | null;
}

/** `tsc --noEmit` in `project` with one TypeScript version: passed, and its first errors when not. */
function typecheckWith(project: string, version: string): { ok: boolean; errors: string[] } {
  const ran = spawnSync(bin(install([`typescript@${version}`]), 'tsc'), ['-p', 'tsconfig.json', '--noEmit', '--pretty', 'false'], { cwd: project, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  if (ran.status === 0) return { ok: true, errors: [] };
  const output = `${ran.stdout}\n${ran.stderr}`;
  const errors = output.split('\n').filter((l) => /error TS\d+/.test(l)).slice(0, ERRORS_KEPT);
  return { ok: false, errors: errors.length > 0 ? errors : [errorLine(output)] };
}

/** Emits `project` with TypeScript 5.9 and runs `boot.js`: exit 0 is "started and served one route". */
function bootIn(project: string): { ok: boolean; detail: string } {
  const emitted = spawnSync(bin(install([`typescript@${TYPESCRIPTS.ts59}`]), 'tsc'), ['-p', 'tsconfig.json', '--noEmitOnError', 'false'], { cwd: project, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  if (!existsSync(path.join(project, 'build', 'boot.js'))) return { ok: false, detail: `emit failed: ${errorLine(`${emitted.stdout}\n${emitted.stderr}`)}` };
  writeFileSync(path.join(project, 'build', 'package.json'), '{"type":"module"}\n');
  // A closed local port: a generated client that calls its API at start-up fails fast instead of reaching the network.
  const ran = spawnSync(process.execPath, [path.join(project, 'build', 'boot.js')], { cwd: project, encoding: 'utf8', timeout: BOOT_TIMEOUT_MS, env: { ...process.env, API_BASE_URL: 'http://127.0.0.1:9' } });
  if (ran.status === 0) return { ok: true, detail: ran.stdout.trim() };
  return { ok: false, detail: ran.signal === null ? errorLine(`${ran.stderr}\n${ran.stdout}`) : `timed out after ${BOOT_TIMEOUT_MS} ms` };
}

export function check(framework: string, output: string, route = '/'): ConsumerReading {
  const chosen = FRAMEWORKS[framework];
  if (chosen === undefined) throw new Error(`no framework is named "${framework}". fix: use one of ${Object.keys(FRAMEWORKS).join(', ')}`);
  // Node's own types beside the framework, so output that reads `process.env` checks as it would in a user's project.
  const installed = install([...chosen.packages, NODE_TYPES]);
  const project = mkdtempSync(path.join(tmpdir(), `apicontract-consumer-${framework}-`));
  try {
    symlinkSync(path.join(installed, 'node_modules'), path.join(project, 'node_modules'), 'dir');
    writeFileSync(path.join(project, 'package.json'), '{"private":true,"type":"module"}\n');
    cpSync(output, path.join(project, 'app'), { recursive: true });
    const files = readdirSync(path.join(project, 'app'), { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
    if (chosen.boot !== undefined) writeFileSync(path.join(project, 'boot.ts'), chosen.boot(route));
    writeFileSync(
      path.join(project, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, target: 'es2022', outDir: 'build', rootDir: '.', types: ['node'], ...chosen.compilerOptions }, include: ['app/**/*', 'boot.ts'] }),
    );

    const typecheck = Object.fromEntries((Object.entries(TYPESCRIPTS) as [TsKey, string][]).map(([key, version]) => [key, typecheckWith(project, version)])) as ConsumerReading['typecheck'];
    const boot = chosen.boot === undefined ? null : bootIn(project);
    return { framework, packages: chosen.packages, files: files.length, typecheck, boot };
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

if (process.argv[1] === import.meta.filename) {
  const { flags } = parseFlags(process.argv.slice(2));
  const str = (name: string): string | undefined => (typeof flags.get(name) === 'string' ? (flags.get(name) as string) : undefined);
  const framework = str('framework');
  if (framework === undefined) throw new Error(`usage: consumers.ts --framework <${Object.keys(FRAMEWORKS).join('|')}> (--output <dir> | --spec <file> [--target <generator>]) [--route /path]`);
  let output = str('output');
  const spec = str('spec');
  let scratch: string | undefined;
  if (output === undefined) {
    if (spec === undefined) throw new Error('pass --output <dir> (a generator\'s output) or --spec <file> (generate it first)');
    scratch = mkdtempSync(path.join(tmpdir(), 'apicontract-consumer-gen-'));
    output = path.join(scratch, 'out');
    generate(spec, str('target') ?? (FRAMEWORKS[framework]?.generator as string), output);
  }
  const reading = check(framework, output, str('route') ?? '/');
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(reading, undefined, 2)}\n`);
  const passed = Object.values(reading.typecheck).every((t) => t.ok) && (reading.boot?.ok ?? true);
  process.exitCode = passed ? 0 : 1;
}
