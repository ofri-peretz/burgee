/** The validator's schemas, made Standard JSON Schema by `standardJson`. */
import { array, number, object, optional, string } from 'validator';
import { standardJson } from 'validator/json-schema';

export const Pet = standardJson(object({ id: number(), name: string(), tag: optional(string()) }));

export const Owner = standardJson(object({ pets: array(object({ id: number() })), email: string() }));
