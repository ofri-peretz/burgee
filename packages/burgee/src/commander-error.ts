/** commander's error classes, byte-for-byte in shape: `code`, `exitCode`, `nestedError`. */
export class CommanderError extends Error {
  code: string;
  exitCode: number;
  nestedError: unknown;

  constructor(exitCode: number, code: string, message?: string) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.code = code;
    this.exitCode = exitCode;
    this.nestedError = undefined;
  }
}

export class InvalidArgumentError extends CommanderError {
  constructor(message?: string) {
    super(1, 'commander.invalidArgument', message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
  }
}
