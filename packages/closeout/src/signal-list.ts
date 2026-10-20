/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The signals `signal-exit` treats as fatal, for a platform — the one copy of the list.
 *
 * Both doors of `closeout/signal-exit` read it: the CommonJS `signal-exit-signals.cts` (which
 * `require()` reaches, and which the suite re-evaluates under each faked platform) and the ES
 * entry `signal-exit.ts` (which `import` reaches). It is a function rather than a constant so
 * that an ES module, evaluated once per process, still answers for the platform of the moment
 * it is called: the re-evaluated CommonJS file calls it again and gets the faked platform.
 *
 * The order is part of the contract: `signal-exit`'s suite snapshots the array.
 *
 * SIGKILL and SIGSTOP are absent because they cannot be caught. SIGUSR1 is absent because Node
 * uses it to start the inspector. SIGPROF, SIGVTALRM's cousin, is absent because profilers
 * send it to living processes.
 *
 * The ambient platform is read through `ambient.ts`, the package's one door to the process (R7).
 */
import { ambientProcess } from './ambient.js';

export function signalsOn(platform: string | undefined = (ambientProcess() as { platform?: string } | undefined)?.platform): string[] {
  const signals = ['SIGHUP', 'SIGINT', 'SIGTERM'];
  if (platform !== 'win32') signals.push('SIGALRM', 'SIGABRT', 'SIGVTALRM', 'SIGXCPU', 'SIGXFSZ', 'SIGUSR2', 'SIGTRAP', 'SIGSYS', 'SIGQUIT', 'SIGIOT');
  if (platform === 'linux') signals.push('SIGIO', 'SIGPOLL', 'SIGPWR', 'SIGSTKFLT');
  return signals;
}
