/** provedone's library surface: the pure pieces its commands are built from, for a host that runs them itself. */
export { program, VERSION } from './cli.js';
export { decide, ESCAPE_AFTER, MODES, recentBlocks, sessionOf, type Decision, type LogEntry, type Mode } from './gate.js';
export { doneLine, doneReport, type CriterionReport, type Stamp } from './done.js';
export { checkIntent, criteria, evidenceRows, indexDrift, unevidenced, type EvidenceRow, type Finding, type IntentLayout } from './intents.js';
export { checkedLine, digest, prBlock, trailers, verdict, type Check, type Receipt, type Verdict } from './receipt.js';
