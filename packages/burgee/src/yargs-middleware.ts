/**
 * yargs' middleware — global, per-command, and the coerce middleware `.coerce()`
 * registers — ported for `burgee/yargs`.
 */
 
import { argsert, isPromise } from './yargs-utils.js';

export interface MiddlewareCallback {
  (argv: any, yargs: any): any;
}

export interface Middleware extends MiddlewareCallback {
  applyBeforeValidation?: boolean;
  global?: boolean;
  mutates?: boolean;
  applied?: boolean;
  option?: string;
}

interface YargsLike {
  getAliases: () => Record<string, string[]>;
}

export class GlobalMiddleware {
  globalMiddleware: Middleware[] = [];
  frozens: Middleware[][] = [];
  yargs: YargsLike;

  constructor(yargs: YargsLike) {
    this.yargs = yargs;
  }

  addMiddleware(callback: Middleware | Middleware[], applyBeforeValidation: boolean, global = true, mutates = false): YargsLike {
    argsert('<array|function> [boolean] [boolean] [boolean]', [callback, applyBeforeValidation, global], arguments.length);
    if (Array.isArray(callback)) {
      for (let i = 0; i < callback.length; i++) {
        if (typeof callback[i] !== 'function') throw Error('middleware must be a function');
        const m = callback[i] as Middleware;
        m.applyBeforeValidation = applyBeforeValidation;
        m.global = global;
      }
      Array.prototype.push.apply(this.globalMiddleware, callback);
    } else if (typeof callback === 'function') {
      const m = callback;
      m.applyBeforeValidation = applyBeforeValidation;
      m.global = global;
      m.mutates = mutates;
      this.globalMiddleware.push(callback);
    }
    return this.yargs;
  }

  addCoerceMiddleware(callback: Middleware, option: string): YargsLike {
    const aliases = this.yargs.getAliases();
    this.globalMiddleware = this.globalMiddleware.filter((m) => {
      const toCheck = [...(aliases[option] || []), option];
      if (!m.option) return true;
      return !toCheck.includes(m.option);
    });
    callback.option = option;
    return this.addMiddleware(callback, true, true, true);
  }

  getMiddleware(): Middleware[] {
    return this.globalMiddleware;
  }

  freeze(): void {
    this.frozens.push([...this.globalMiddleware]);
  }

  unfreeze(): void {
    const frozen = this.frozens.pop();
    if (frozen !== undefined) this.globalMiddleware = frozen;
  }

  reset(): void {
    this.globalMiddleware = this.globalMiddleware.filter((m) => m.global);
  }
}

export function commandMiddlewareFactory(commandMiddleware?: Middleware[]): Middleware[] {
  if (!commandMiddleware) return [];
  return commandMiddleware.map((middleware) => {
    middleware.applyBeforeValidation = false;
    return middleware;
  });
}

export function applyMiddleware(argv: any, yargs: any, middlewares: Middleware[], beforeValidation: boolean): any {
  return middlewares.reduce((acc, middleware) => {
    if (middleware.applyBeforeValidation !== beforeValidation) return acc;
    if (middleware.mutates) {
      if (middleware.applied) return acc;
      middleware.applied = true;
    }
    if (isPromise(acc)) {
      return acc
        .then((initialObj: any) => Promise.all([initialObj, middleware(initialObj, yargs)]))
        .then(([initialObj, middlewareObj]: any[]) => Object.assign(initialObj, middlewareObj));
    }
    const result = middleware(acc, yargs);
    return isPromise(result) ? result.then((middlewareObj: any) => Object.assign(acc, middlewareObj)) : Object.assign(acc, result);
  }, argv);
}
