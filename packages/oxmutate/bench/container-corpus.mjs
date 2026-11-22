// Container mode's setup on real repositories: is `{"container": true}` the whole setup? A sibling
// of container.mjs, which compares two builds on time and verdicts (three rounds, no network, a
// `command` override); this one asks "does it work at all, on this kind of project", once per case,
// with the network the install needs, so the two stay separate. `--host` is the build under test
// (default: this checkout's dist/bin.js); the oxmutate inside is whatever npm serves for that
// version, so a candidate whose engine differs from its published version must be released first.
//
//   node packages/oxmutate/bench/container-corpus.mjs [--cases berry,berryOk,yarn1,workspace,berryWorkspace,needsNetwork,registry,failures]
//        [--engine docker|podman] [--host <dist/bin.js>] [--candidate-dist <dist>] [--out <file.json>]
//
// berry, berryOk, yarn1, workspace, berryWorkspace, needsNetwork: a real repository pinned to a commit,
//   run with a config of exactly {"container": true}; each says whether that must end with a report
//   or fail in the dry run with a line naming the fix (see REPOS). `--candidate-dist` lays this build's
//   dist over the inside oxmutate, for engine changes not yet released.
// registry: a local Verdaccio (a container on the `oxmutate-corpus` network) holding `@corp/greeter`,
//   which needs a token. The host's npm user config is a temp file naming `${NODE_AUTH_TOKEN}`; the
//   install must succeed and the tests must see neither the token nor the file. A control run puts
//   the token into `container.env`, and the same test must then fail.
// failures: the one line each setup mistake prints, and whether it names a fix.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(homedir(), '.cache', 'oxmutate-bench', 'corpus');
const MS_PER_S = 1000;
const RUN_TIMEOUT_MS = 40 * 60 * MS_PER_S;
const OUTPUT_BYTES = 256 * 1024 * 1024;
const REGISTRY_PORT = 4873;
const REGISTRY_NAME = 'oxmutate-corpus-registry';
const NETWORK = 'oxmutate-corpus';
const VERDACCIO = 'verdaccio/verdaccio:6';
/** How a container reaches the host's published port. */
const HOST_ALIAS = 'host.docker.internal';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const engine = opt('engine', 'docker');
const host = path.resolve(opt('host', path.join(HERE, '../dist/bin.js')));
const candidateDist = opt('candidate-dist') ? path.resolve(opt('candidate-dist')) : undefined;
const quiet = { FORCE_COLOR: '0', NO_COLOR: '1' };

/**
 * Real repositories, pinned, one per case. `dir` is where oxmutate runs. `expect` is what a config of
 * exactly `{"container": true}` must do: end with a report (`report`), or fail in the dry run with a
 * line naming the fix (`fails`, a pattern the line must match), and then, when `then` names an
 * `install`, a run with that install must end with a report.
 */
const REPOS = {
  berry: { repo: 'https://github.com/electron/asar.git', commit: '8257ba996b85701af5a3e41d7d7b09f4596686ba', dir: '.', what: 'Yarn 4 (berry) on Vitest; the tests import lib/, which `yarn build` makes', expect: 'fails', line: /container\.install: "<the install> && <your build/u, then: 'corepack enable && yarn install --immutable && yarn build' },
  berryOk: { repo: 'https://github.com/Apple-Actions/import-codesign-certs.git', commit: '2429e2f9ca182c1e26e6b2ab9928f7c2aae31703', dir: '.', what: 'Yarn 4 (berry) on Vitest, tests need nothing built', expect: 'report' },
  yarn1: { repo: 'https://github.com/acrazing/dpdm.git', commit: '52ac8b89b90615fc2398c9a95f53cafa33f558dc', dir: '.', what: 'Yarn 1 on Vitest', expect: 'report' },
  workspace: { repo: 'https://github.com/twoslashes/twoslash.git', commit: 'e88c8708deb8d63349f48d840b1cd74cb807a7ce', dir: 'packages/twoslash-remote', what: 'pnpm workspace monorepo on Vitest 4, run from one package', expect: 'report' },
  berryWorkspace: { repo: 'https://github.com/puzzmo-com/xd-crossword-tools.git', commit: '930437b06cc6335e45b77b536045996127521b0b', dir: '.', what: 'Yarn 4 workspace monorepo on Vitest 3.1 (older than the 4.1 oxmutate supports)', expect: 'fails', line: /upgrade vitest/u },
  needsNetwork: { repo: 'https://github.com/electron/get.git', commit: '9b4a554ffee4a5b659709feb14a364f75ce8c9fb', dir: '.', what: 'Yarn 4 on Vitest whose tests call the network (its own suite also fails with the network on)', expect: 'fails', line: /container\.network/u },
};

const names = opt('cases', `${Object.keys(REPOS).join(',')},registry,failures`).split(',');

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

function prepare(name) {
  const r = REPOS[name];
  const dir = path.join(ROOT, name);
  if (!existsSync(dir)) {
    mkdirSync(ROOT, { recursive: true });
    execFileSync('git', ['clone', '-q', r.repo, dir]);
  }
  git(dir, 'checkout', '-q', '-f', r.commit);
  // Untracked leftovers of an earlier run (reports, config) go; the volume, not the tree, is the warm part.
  git(dir, 'clean', '-fdxq', '-e', 'node_modules');
  return dir;
}

/** `oxmutate run` on `cwd` with `config` as its whole configuration; the report is read when there is one. */
function runOxmutate(cwd, config, extraArgs = [], env = {}) {
  writeFileSync(path.join(cwd, 'oxmutate.config.json'), JSON.stringify(config));
  const report = path.join(cwd, 'reports/mutation/mutation.json');
  rmSync(report, { force: true });
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [host, 'run', '--reporter', 'json', ...extraArgs], { cwd, encoding: 'utf8', maxBuffer: OUTPUT_BYTES, timeout: RUN_TIMEOUT_MS, env: { ...process.env, ...quiet, ...env } });
  const wallS = (performance.now() - t0) / MS_PER_S;
  const lines = `${r.stderr}\n${r.stdout}`.split('\n').filter(Boolean);
  // The line oxmutate itself ends with (`oxmutate: …`); the last line of anything else is the install's output.
  const said = r.stderr.split('\n').filter((l) => l.startsWith('oxmutate: ') || l.startsWith('{"error"')).at(-1);
  const out = { exit: r.status, wallS: Number(wallS.toFixed(1)), stdout: r.stdout, stderr: r.stderr, last: said ?? lines.at(-1) ?? '' };
  if (existsSync(report)) {
    const files = Object.values(JSON.parse(readFileSync(report, 'utf8')).files);
    const count = {};
    for (const f of files) for (const m of f.mutants) count[m.status] = (count[m.status] ?? 0) + 1;
    out.mutants = files.reduce((n, f) => n + f.mutants.length, 0);
    out.statuses = count;
  }
  return out;
}

/** `{"container": true}`, or an object when the engine, the install or the candidate's build asks for one. */
function containerConfig(extra = {}) {
  const base = { ...(engine === 'docker' ? {} : { engine }), ...extra };
  if (candidateDist) {
    // The inside oxmutate is the published one; the candidate's build is laid over it, so unreleased engine changes run.
    const version = JSON.parse(readFileSync(path.join(HERE, '../package.json'), 'utf8')).version;
    base.runArgs = ['-v', `${candidateDist}:/w/.oxmutate/${version}/node_modules/oxmutate/dist:ro`];
  }
  return { container: Object.keys(base).length === 0 ? true : base };
}

/** The project's own volume goes, so a case starts from a checkout and nothing an earlier run built in it. */
function resetVolume(dir) {
  const top = realpathSync.native(git(dir, 'rev-parse', '--show-toplevel'));
  spawnSync(engine, ['volume', 'rm', '-f', `oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, 12)}`], { encoding: 'utf8' });
}

function repoCase(name) {
  const r = REPOS[name];
  const dir = prepare(name);
  resetVolume(dir);
  const cwd = path.join(dir, r.dir);
  const config = containerConfig();
  const first = runOxmutate(cwd, config);
  const reported = (x) => x.mutants !== undefined && [0, 1].includes(x.exit);
  let ok;
  let second;
  if (r.expect === 'report') {
    ok = reported(first);
    second = ok ? runOxmutate(cwd, config) : undefined;
  } else {
    ok = !reported(first) && r.line.test(first.last);
    if (ok && r.then) {
      second = runOxmutate(cwd, containerConfig({ install: r.then }));
      ok = reported(second);
    }
  }
  return { case: name, what: r.what, repo: r.repo, commit: r.commit, config: JSON.stringify(config), expect: r.expect, ok, first: { ...brief(first), line: reported(first) ? undefined : first.last }, second: second && { ...brief(second), line: reported(second) ? undefined : second.last } };
}

const brief = (x) => ({ exit: x.exit, wallS: x.wallS, mutants: x.mutants, statuses: x.statuses });

const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: OUTPUT_BYTES, ...o });

// ---------------------------------------------------------------- the private registry

async function registryCase() {
  const work = mkdtempSync(path.join(tmpdir(), 'oxmutate-registry-'));
  const conf = path.join(work, 'config.yaml');
  writeFileSync(conf, `storage: /verdaccio/storage\nauth:\n  htpasswd:\n    file: /verdaccio/storage/htpasswd\npackages:\n  '@corp/*':\n    access: $authenticated\n    publish: $authenticated\nlog: { type: stdout, format: pretty, level: warn }\n`);
  sh(engine, ['rm', '-f', REGISTRY_NAME]);
  sh(engine, ['network', 'create', NETWORK]);
  // The `verdaccio/verdaccio` image when it is here; else Verdaccio from npm inside the Node image the runs already use.
  const haveImage = sh(engine, ['image', 'inspect', VERDACCIO]).status === 0;
  const base = ['run', '-d', '--name', REGISTRY_NAME, '--network', NETWORK, '-p', `127.0.0.1:${REGISTRY_PORT}:4873`, '-v', `${conf}:/verdaccio/conf/config.yaml:ro`];
  const up = haveImage
    ? sh(engine, [...base, VERDACCIO])
    : sh(engine, [...base, 'node:22-bookworm-slim', 'sh', '-c', `mkdir -p /verdaccio/storage && npm i -g --no-audit --no-fund verdaccio@6 >/dev/null 2>&1 && exec verdaccio -c /verdaccio/conf/config.yaml -l 0.0.0.0:${REGISTRY_PORT}`]);
  if (up.status !== 0) throw new Error(`verdaccio did not start: ${up.stderr}`);
  const local = `http://localhost:${REGISTRY_PORT}/`;
  try {
    let ready = false;
    for (let i = 0; i < 720 && !ready; i++) {
      // eslint-disable-next-line no-await-in-loop -- a poll: the fallback installs Verdaccio first, which takes minutes on a loaded machine
      ready = await fetch(`${local}-/ping`).then((r) => r.ok, () => false);
      // eslint-disable-next-line no-await-in-loop -- a poll
      if (!ready) await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error(`verdaccio did not answer in 6 minutes: ${sh(engine, ['logs', REGISTRY_NAME]).stdout.slice(-500)}`);
    const made = await fetch(`${local}-/user/org.couchdb.user:ci`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'ci', password: 'ci-password-1', email: 'ci@oxmutate.test', type: 'user' }) });
    const token = (await made.json()).token;
    if (!token) throw new Error('verdaccio gave no token');
    // The host's npm user config, as a temp file: it names the variable, never the value.
    const npmrc = (h) => `@corp:registry=http://${h}:${REGISTRY_PORT}/\n//${h}:${REGISTRY_PORT}/:_authToken=\${NODE_AUTH_TOKEN}\n`;
    const hostRc = path.join(work, 'npmrc-localhost');
    const dockerRc = path.join(work, 'npmrc-container');
    writeFileSync(hostRc, npmrc('localhost'));
    writeFileSync(dockerRc, npmrc(HOST_ALIAS));
    const withToken = { ...process.env, ...quiet, NODE_AUTH_TOKEN: token };

    const pkg = path.join(work, 'greeter');
    mkdirSync(pkg);
    writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@corp/greeter', version: '1.0.0', type: 'module', exports: './index.js', license: 'UNLICENSED' }));
    writeFileSync(path.join(pkg, 'index.js'), "export const greet = (name) => `hello ${name}`;\n");
    const published = sh('npm', ['publish', '--userconfig', hostRc], { cwd: pkg, env: { ...withToken, npm_config_userconfig: hostRc } });
    if (published.status !== 0) throw new Error(`publish failed: ${published.stderr}`);
    const anonymous = await fetch(`${local}@corp/greeter`).then((r) => r.status, (e) => `no answer: ${String(e.cause?.message ?? e)}`);

    const app = path.join(ROOT, 'registry-app');
    rmSync(app, { recursive: true, force: true });
    mkdirSync(path.join(app, 'src'), { recursive: true });
    // eslint-disable-next-line conventions/prefer-dependency-version-strategy -- a benchmark target is pinned
    writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'registry-app', private: true, type: 'module', dependencies: { '@corp/greeter': '1.0.0' }, devDependencies: { vitest: '4.1.9' } }, null, 2));
    writeFileSync(path.join(app, 'src/hello.ts'), "import { greet } from '@corp/greeter';\nexport const hello = (name: string): string => (name.length > 0 ? greet(name) : greet('stranger'));\n");
    writeFileSync(path.join(app, 'src/hello.test.ts'), "import { expect, it } from 'vitest';\nimport { hello } from './hello.js';\nit('greets', () => { expect(hello('ofri')).toBe('hello ofri'); });\nit('greets a stranger', () => { expect(hello('')).toBe('hello stranger'); });\n");
    writeFileSync(path.join(app, 'src/secrets.test.ts'), [
      "import { existsSync } from 'node:fs';",
      "import { homedir } from 'node:os';",
      "import { expect, it } from 'vitest';",
      "it('sees no registry token and no npm config', () => {",
      '  const files = [`${homedir()}/.npmrc`, `${homedir()}/.yarnrc.yml`, \'/tmp/oxmutate-npmrc\', \'/tmp/oxmutate-home/.yarnrc.yml\'];',
      "  const seen = { NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN, npm_config_userconfig: process.env.npm_config_userconfig, files: files.map((f) => [f, existsSync(f)]), tokenShapedEnv: Object.entries(process.env).filter(([, v]) => /^eyJ|npm_[A-Za-z0-9]{20}/u.test(v ?? '')).map(([k]) => k) };",
      "  console.log('SEEN BY THE TEST', JSON.stringify(seen));",
      '  expect(seen.NODE_AUTH_TOKEN).toBeUndefined();',
      '  expect(seen.npm_config_userconfig).toBeUndefined();',
      '  expect(seen.files.filter(([, there]) => there)).toEqual([]);',
      '  expect(seen.tokenShapedEnv).toEqual([]);',
      '});',
      '',
    ].join('\n'));
    writeFileSync(path.join(app, '.gitignore'), 'node_modules\nreports\n');
    // The lockfile as the host's login makes it, then pointed at the name a container reaches the registry by.
    sh('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], { cwd: app, env: { ...withToken, npm_config_userconfig: hostRc } });
    const lock = path.join(app, 'package-lock.json');
    writeFileSync(lock, readFileSync(lock, 'utf8').replaceAll(`http://localhost:${REGISTRY_PORT}/`, `http://${HOST_ALIAS}:${REGISTRY_PORT}/`));
    for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-qm', 'app']]) execFileSync('git', a, { cwd: app });
    const resolvedAtRegistry = readFileSync(lock, 'utf8').includes(`${HOST_ALIAS}:${REGISTRY_PORT}`);

    // `cache: false`: the shared package cache would answer the install from an earlier run's tarball, and the token would never be asked for.
    const config = { container: { ...(engine === 'docker' ? {} : { engine }), cache: false } };
    const viaFile = { npm_config_userconfig: dockerRc };
    resetVolume(app);
    const good = runOxmutate(app, config, [], { ...withToken, ...viaFile });
    // No token on the host: the install cannot read the registry.
    resetVolume(app);
    const noToken = runOxmutate(app, config, [], { ...viaFile, NODE_AUTH_TOKEN: ''  });
    resetVolume(app);
    // The control: the token handed to the tests on purpose must fail the secrets test.
    const control = runOxmutate(app, { container: { ...(engine === 'docker' ? {} : { engine }), cache: false, env: ['NODE_AUTH_TOKEN'] } }, [], { ...withToken, ...viaFile });
    const seen = (x) => x.stdout.split('\n').find((l) => l.includes('SEEN BY THE TEST'))?.trim();
    return {
      case: 'registry',
      what: 'a scoped package that needs a token, on a Verdaccio container',
      anonymousRequestStatus: anonymous,
      lockfileResolvesAtRegistry: resolvedAtRegistry,
      installAndRun: { ...brief(good), testSaw: seen(good) },
      controlTokenInEnv: { ...brief(control), last: control.last, testSaw: seen(control)?.replace(token, '<token>') },
      withoutToken: { ...brief(noToken), last: noToken.last },
      ok: good.mutants !== undefined && [0, 1].includes(good.exit) && anonymous === 401 && control.mutants === undefined,
    };
  } finally {
    sh(engine, ['rm', '-f', REGISTRY_NAME]);
    sh(engine, ['network', 'rm', NETWORK]);
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- the failure lines

/** A tiny repository: a package.json, a test, a source; `files` are written on top, then committed. */
function tiny(name, files) {
  const dir = path.join(ROOT, `fail-${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  // eslint-disable-next-line conventions/prefer-dependency-version-strategy -- a benchmark target is pinned
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `fail-${name}`, private: true, type: 'module', devDependencies: { vitest: '4.1.9' } }));
  writeFileSync(path.join(dir, 'src/a.ts'), 'export const a = (x: number): number => x + 1;\n');
  writeFileSync(path.join(dir, 'src/a.test.ts'), "import { expect, it } from 'vitest';\nimport { a } from './a.js';\nit('adds', () => { expect(a(1)).toBe(2); });\n");
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules\nreports\n');
  for (const [f, content] of Object.entries(files)) writeFileSync(path.join(dir, f), content);
  for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-qm', 'x']]) execFileSync('git', a, { cwd: dir });
  return dir;
}

const NAMES_A_FIX = /\bfix:/u;

function failureCases() {
  const rows = [];
  const add = (name, setup, r) => rows.push({ case: name, setup, exit: r.exit, line: r.last, namesFix: NAMES_A_FIX.test(r.last) });
  const noop = '{"container": true}';

  const a = tiny('host', {});
  add('unreachable container.host', 'container.host tcp://127.0.0.1:1', runOxmutate(a, { container: { host: 'tcp://127.0.0.1:1' } }));

  const b = tiny('daemon', {});
  add('Docker daemon not running', 'DOCKER_HOST=unix:///nonexistent/docker.sock (the daemon is not stopped: other work shares it)', runOxmutate(b, { container: true }, [], { DOCKER_HOST: 'unix:///nonexistent/docker.sock' }));

  const c = tiny('install', { 'package.json': JSON.stringify({ name: 'x', private: true, type: 'module', devDependencies: { vitest: '4.1.9', '@oxmutate-corpus/does-not-exist': '1.0.0' } }) });
  add('install fails', 'a dependency no registry has', runOxmutate(c, { container: true }));

  const d = tiny('stale', {});
  execFileSync('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], { cwd: d });
  writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'x', private: true, type: 'module', devDependencies: { vitest: '4.1.9', ms: '2.1.3' } }));
  for (const x of [['add', '-A'], ['-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-qm', 'lock']]) execFileSync('git', x, { cwd: d });
  add('lockfile out of date', 'package.json names ms, package-lock.json does not', runOxmutate(d, { container: true }));

  const e = tiny('bun', { 'bun.lock': '{}\n' });
  add('bun lockfile, no install', 'bun.lock and container: true', runOxmutate(e, JSON.parse(noop)));
  return rows;
}

// ---------------------------------------------------------------- main

const results = [];
for (const name of names) {
  console.log(`== ${name}`);
  // eslint-disable-next-line no-await-in-loop -- one case at a time: they share the machine
  const r = name === 'registry' ? await registryCase() : name === 'failures' ? { case: 'failures', rows: failureCases() } : repoCase(name);
  console.log(JSON.stringify(r, null, 2));
  results.push(r);
}
const out = opt('out');
if (out) writeFileSync(path.resolve(out), `${JSON.stringify({ at: new Date().toISOString(), engine, host, results }, null, 2)}\n`);
process.exitCode = results.every((r) => r.ok ?? r.rows?.every((x) => x.namesFix)) ? 0 : 1;
