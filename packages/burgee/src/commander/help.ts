import { stripVTControlCharacters } from 'node:util';

import { type Argument, humanReadableArgName } from './argument.js';
import type { Command } from './command.js';
import type { Option } from './option.js';

export interface HelpContext {
  error?: boolean;
  helpWidth?: number;
  outputHasColors?: boolean;
}

/** Methods are static in style so a subclass, or plain functions via `configureHelp`, can override them. */
export class Help {
  helpWidth: number | undefined = undefined;
  minWidthToWrap = 40;
  sortSubcommands = false;
  sortOptions = false;
  showGlobalOptions = false;

  /** Called after `configureHelp` overrides are applied and just before `formatHelp`. */
  prepareContext(contextOptions: HelpContext): void {
    this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
  }

  visibleCommands(cmd: Command): Command[] {
    const visibleCommands = cmd.commands.filter((sub) => !sub._hidden);
    const helpCommand = cmd._getHelpCommand();
    if (helpCommand && !helpCommand._hidden) visibleCommands.push(helpCommand);
    if (this.sortSubcommands) visibleCommands.sort((a, b) => a.name().localeCompare(b.name()));
    return visibleCommands;
  }

  compareOptions(a: Option, b: Option): number {
    const getSortKey = (option: Option): string =>
      option.short ? option.short.replace(/^-/, '') : (option.long ?? '').replace(/^--/, '');
    return getSortKey(a).localeCompare(getSortKey(b));
  }

  visibleOptions(cmd: Command): Option[] {
    const visibleOptions = cmd.options.filter((option) => !option.hidden);
    const helpOption = cmd._getHelpOption();
    if (helpOption && !helpOption.hidden) {
      // Historical: hide the built-in help flags a user option already took.
      const removeShort = helpOption.short && cmd._findOption(helpOption.short);
      const removeLong = helpOption.long && cmd._findOption(helpOption.long);
      if (!removeShort && !removeLong) visibleOptions.push(helpOption);
      else if (helpOption.long && !removeLong) visibleOptions.push(cmd.createOption(helpOption.long, helpOption.description));
      else if (helpOption.short && !removeShort) visibleOptions.push(cmd.createOption(helpOption.short, helpOption.description));
    }
    if (this.sortOptions) visibleOptions.sort(this.compareOptions);
    return visibleOptions;
  }

  visibleGlobalOptions(cmd: Command): Option[] {
    if (!this.showGlobalOptions) return [];
    const globalOptions: Option[] = [];
    for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
      globalOptions.push(...ancestorCmd.options.filter((option) => !option.hidden));
    }
    if (this.sortOptions) globalOptions.sort(this.compareOptions);
    return globalOptions;
  }

  visibleArguments(cmd: Command): Argument[] {
    // Side effect: apply the legacy descriptions before the arguments are displayed.
    if (cmd._argsDescription) {
      for (const argument of cmd.registeredArguments) {
        argument.description = argument.description || cmd._argsDescription[argument.name()] || '';
      }
    }
    if (cmd.registeredArguments.find((argument) => argument.description)) return cmd.registeredArguments;
    return [];
  }

  subcommandTerm(cmd: Command): string {
    const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(' ');
    return (
      cmd._name +
      (cmd._aliases[0] ? `|${cmd._aliases[0]}` : '') +
      (cmd.options.length ? ' [options]' : '') +
      (args ? ` ${args}` : '')
    );
  }

  optionTerm(option: Option): string {
    return option.flags;
  }

  argumentTerm(argument: Argument): string {
    return argument.name();
  }

  longestSubcommandTermLength(cmd: Command, helper: Help): number {
    return helper
      .visibleCommands(cmd)
      .reduce((max, command) => Math.max(max, this.displayWidth(helper.styleSubcommandTerm(helper.subcommandTerm(command)))), 0);
  }

  longestOptionTermLength(cmd: Command, helper: Help): number {
    return helper
      .visibleOptions(cmd)
      .reduce((max, option) => Math.max(max, this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))), 0);
  }

  longestGlobalOptionTermLength(cmd: Command, helper: Help): number {
    return helper
      .visibleGlobalOptions(cmd)
      .reduce((max, option) => Math.max(max, this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))), 0);
  }

  longestArgumentTermLength(cmd: Command, helper: Help): number {
    return helper
      .visibleArguments(cmd)
      .reduce((max, argument) => Math.max(max, this.displayWidth(helper.styleArgumentTerm(helper.argumentTerm(argument)))), 0);
  }

  commandUsage(cmd: Command): string {
    let cmdName = cmd._name;
    if (cmd._aliases[0]) cmdName = `${cmdName}|${cmd._aliases[0]}`;
    let ancestorCmdNames = '';
    for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
      ancestorCmdNames = `${ancestorCmd.name()} ${ancestorCmdNames}`;
    }
    return `${ancestorCmdNames}${cmdName} ${cmd.usage()}`;
  }

  commandDescription(cmd: Command): string {
    return cmd.description();
  }

  /** Summary, falling back to description for backwards compatibility. */
  subcommandDescription(cmd: Command): string {
    return cmd.summary() || cmd.description();
  }

  optionDescription(option: Option): string {
    const extraInfo: string[] = [];
    if (option.argChoices) {
      extraInfo.push(`choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(', ')}`);
    }
    if (option.defaultValue !== undefined) {
      // Defaults for boolean and negated are more for the programmer than the end user.
      const showDefault =
        option.required || option.optional || (option.isBoolean() && typeof option.defaultValue === 'boolean');
      if (showDefault) extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
    }
    if (option.presetArg !== undefined && option.optional) extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
    if (option.envVar !== undefined) extraInfo.push(`env: ${option.envVar}`);
    if (extraInfo.length > 0) {
      const extraDescription = `(${extraInfo.join(', ')})`;
      return option.description ? `${option.description} ${extraDescription}` : extraDescription;
    }
    return option.description;
  }

  argumentDescription(argument: Argument): string {
    const extraInfo: string[] = [];
    if (argument.argChoices) {
      extraInfo.push(`choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(', ')}`);
    }
    if (argument.defaultValue !== undefined) {
      extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
    }
    if (extraInfo.length > 0) {
      const extraDescription = `(${extraInfo.join(', ')})`;
      return argument.description ? `${argument.description} ${extraDescription}` : extraDescription;
    }
    return argument.description;
  }

  formatItemList(heading: string, items: string[], helper: Help): string[] {
    if (items.length === 0) return [];
    return [helper.styleTitle(heading), ...items, ''];
  }

  /** Groups in order of first appearance among all items; members in order of the visible items. */
  groupItems<T>(unsortedItems: T[], visibleItems: T[], getGroup: (item: T) => string): Map<string, T[]> {
    const result = new Map<string, T[]>();
    for (const item of unsortedItems) {
      const group = getGroup(item);
      if (!result.has(group)) result.set(group, []);
    }
    for (const item of visibleItems) {
      const group = getGroup(item);
      const members = result.get(group);
      if (members === undefined) result.set(group, [item]);
      else members.push(item);
    }
    return result;
  }

  formatHelp(cmd: Command, helper: Help): string {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth ?? 80;
    const callFormatItem = (term: string, description: string): string => helper.formatItem(term, termWidth, description, helper);

    let output = [`${helper.styleTitle('Usage:')} ${helper.styleUsage(helper.commandUsage(cmd))}`, ''];

    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([helper.boxWrap(helper.styleCommandDescription(commandDescription), helpWidth), '']);
    }

    const argumentList = helper
      .visibleArguments(cmd)
      .map((argument) =>
        callFormatItem(
          helper.styleArgumentTerm(helper.argumentTerm(argument)),
          helper.styleArgumentDescription(helper.argumentDescription(argument)),
        ),
      );
    output = output.concat(this.formatItemList('Arguments:', argumentList, helper));

    const optionGroups = this.groupItems(cmd.options, helper.visibleOptions(cmd), (option) => option.helpGroupHeading ?? 'Options:');
    for (const [group, options] of optionGroups) {
      const optionList = options.map((option) =>
        callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option)),
        ),
      );
      output = output.concat(this.formatItemList(group, optionList, helper));
    }

    if (helper.showGlobalOptions) {
      const globalOptionList = helper
        .visibleGlobalOptions(cmd)
        .map((option) =>
          callFormatItem(
            helper.styleOptionTerm(helper.optionTerm(option)),
            helper.styleOptionDescription(helper.optionDescription(option)),
          ),
        );
      output = output.concat(this.formatItemList('Global Options:', globalOptionList, helper));
    }

    const commandGroups = this.groupItems(cmd.commands, helper.visibleCommands(cmd), (sub) => sub.helpGroup() || 'Commands:');
    for (const [group, commands] of commandGroups) {
      const commandList = commands.map((sub) =>
        callFormatItem(
          helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
          helper.styleSubcommandDescription(helper.subcommandDescription(sub)),
        ),
      );
      output = output.concat(this.formatItemList(group, commandList, helper));
    }

    return output.join('\n');
  }

  /** Width ignoring ANSI escapes, for padding and wrapping. */
  displayWidth(str: string): number {
    return stripVTControlCharacters(str).length;
  }

  styleTitle(str: string): string {
    return str;
  }

  styleUsage(str: string): string {
    // Assume the default usage shape: command subcommand [options] [command] <foo> [bar]
    return str
      .split(' ')
      .map((word) => {
        if (word === '[options]') return this.styleOptionText(word);
        if (word === '[command]') return this.styleSubcommandText(word);
        if (word[0] === '[' || word[0] === '<') return this.styleArgumentText(word);
        return this.styleCommandText(word);
      })
      .join(' ');
  }

  styleCommandDescription(str: string): string {
    return this.styleDescriptionText(str);
  }

  styleOptionDescription(str: string): string {
    return this.styleDescriptionText(str);
  }

  styleSubcommandDescription(str: string): string {
    return this.styleDescriptionText(str);
  }

  styleArgumentDescription(str: string): string {
    return this.styleDescriptionText(str);
  }

  styleDescriptionText(str: string): string {
    return str;
  }

  styleOptionTerm(str: string): string {
    return this.styleOptionText(str);
  }

  styleSubcommandTerm(str: string): string {
    return str
      .split(' ')
      .map((word) => {
        if (word === '[options]') return this.styleOptionText(word);
        if (word[0] === '[' || word[0] === '<') return this.styleArgumentText(word);
        return this.styleSubcommandText(word);
      })
      .join(' ');
  }

  styleArgumentTerm(str: string): string {
    return this.styleArgumentText(str);
  }

  styleOptionText(str: string): string {
    return str;
  }

  styleArgumentText(str: string): string {
    return str;
  }

  styleSubcommandText(str: string): string {
    return str;
  }

  styleCommandText(str: string): string {
    return str;
  }

  padWidth(cmd: Command, helper: Help): number {
    return Math.max(
      helper.longestOptionTermLength(cmd, helper),
      helper.longestGlobalOptionTermLength(cmd, helper),
      helper.longestSubcommandTermLength(cmd, helper),
      helper.longestArgumentTermLength(cmd, helper),
    );
  }

  /** Manually wrapped text: a line break followed by whitespace. */
  preformatted(str: string): boolean {
    return /\n[^\S\r\n]/.test(str);
  }

  /**
   * Pad the term and wrap the description, indenting the following lines:
   *   TTT  DDD DDDD
   *        DD DDD
   */
  formatItem(term: string, termWidth: number, description: string, helper: Help): string {
    const itemIndent = 2;
    const itemIndentStr = ' '.repeat(itemIndent);
    if (!description) return itemIndentStr + term;

    const paddedTerm = term.padEnd(termWidth + term.length - helper.displayWidth(term));
    const spacerWidth = 2;
    const helpWidth = this.helpWidth ?? 80;
    const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
    let formattedDescription: string;
    if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
      formattedDescription = description;
    } else {
      const wrappedDescription = helper.boxWrap(description, remainingWidth);
      formattedDescription = wrappedDescription.replace(/\n/g, `\n${' '.repeat(termWidth + spacerWidth)}`);
    }
    return itemIndentStr + paddedTerm + ' '.repeat(spacerWidth) + formattedDescription.replace(/\n/g, `\n${itemIndentStr}`);
  }

  /** Wrap at whitespace, preserving existing line breaks; skipped below `minWidthToWrap`. */
  boxWrap(str: string, width: number): string {
    if (width < this.minWidthToWrap) return str;
    const rawLines = str.split(/\r\n|\n/);
    const chunkPattern = /[\s]*[^\s]+/g;
    const wrappedLines: string[] = [];
    for (const line of rawLines) {
      const chunks = line.match(chunkPattern);
      if (chunks === null) {
        wrappedLines.push('');
        continue;
      }
      let sumChunks = [chunks.shift() ?? ''];
      let sumWidth = this.displayWidth(sumChunks[0] ?? '');
      for (const chunk of chunks) {
        const visibleWidth = this.displayWidth(chunk);
        if (sumWidth + visibleWidth <= width) {
          sumChunks.push(chunk);
          sumWidth += visibleWidth;
          continue;
        }
        wrappedLines.push(sumChunks.join(''));
        const nextChunk = chunk.trimStart();
        sumChunks = [nextChunk];
        sumWidth = this.displayWidth(nextChunk);
      }
      wrappedLines.push(sumChunks.join(''));
    }
    return wrappedLines.join('\n');
  }
}
