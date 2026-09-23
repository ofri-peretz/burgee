/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/signal-exit/signals` — the signals `signal-exit` treats as fatal, for this platform.
 *
 * Read from the ambient `process.platform` at load, because that is when `signal-exit`'s own
 * `./signals` reads it and its suite snapshots the list once per faked platform. The order is
 * part of the contract: the snapshot compares arrays.
 *
 * CommonJS (`.cts`) for the same reason as `signal-exit.cts`: the suite re-evaluates this file
 * under each faked platform, and an ES module is evaluated once per process.
 *
 * SIGKILL and SIGSTOP are absent because they cannot be caught. SIGUSR1 is absent because Node
 * uses it to start the inspector. SIGPROF, SIGVTALRM's cousin, is absent because profilers
 * send it to living processes.
 */
const platform = (globalThis as { process?: { platform?: string } }).process?.platform;

const signals: string[] = ['SIGHUP', 'SIGINT', 'SIGTERM'];
if (platform !== 'win32') signals.push('SIGALRM', 'SIGABRT', 'SIGVTALRM', 'SIGXCPU', 'SIGXFSZ', 'SIGUSR2', 'SIGTRAP', 'SIGSYS', 'SIGQUIT', 'SIGIOT');
if (platform === 'linux') signals.push('SIGIO', 'SIGPOLL', 'SIGPWR', 'SIGSTKFLT');

export = { signals };
