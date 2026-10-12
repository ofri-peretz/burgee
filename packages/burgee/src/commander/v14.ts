/**
 * `burgee/commander/v14` — `burgee/commander` for a program on commander 14, the entry
 * `burgee migrate` writes for one (`previous-majors` R1, R6). The one difference commander
 * 14.0.3's own suite measures: its excess-arguments message stops at the count, where 15
 * names the surplus arguments. Kept out of `command.ts`, so a 15 program bundles none of it.
 */
import { Command as Current } from './command.js';

export * from '../commander.js';

export class Command extends Current {
  // `.command()` makes subcommands here, so theirs is 14's message too.
  override createCommand(name?: string): Command {
    return new Command(name);
  }

  override _excessArguments(args: string[]): void {
    if (this._allowExcessArguments) return;
    const expected = this.registeredArguments.length;
    const forSub = this.parent ? ` for '${this.name()}'` : '';
    this.error(`error: too many arguments${forSub}. Expected ${expected} argument${expected === 1 ? '' : 's'} but got ${args.length}.`, { code: 'commander.excessArguments' });
  }
}

export const program = new Command();

export const createCommand = (name?: string): Command => new Command(name);
