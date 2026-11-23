/** The commands the feature lanes own, one file each. Created by PLAN.md 6.0. */
import { command as diff } from './command-diff.js';
import { command as explain } from './command-explain.js';
import { command as lint } from './command-lint.js';
import { command as migrate } from './command-migrate.js';
import { command as plugin } from './command-plugin.js';

export const commands = [explain, diff, lint, migrate, plugin] as const;
