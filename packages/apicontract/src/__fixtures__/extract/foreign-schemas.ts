/** Values that are not Standard JSON Schema, each the way a real library hands them out. */

/** A Standard Schema of a library that has no `jsonSchema` yet (Zod 3, for one). */
export const Legacy = { '~standard': { version: 1, vendor: 'zod', validate: (value: unknown) => ({ value }) } };

/** A Standard Schema of a library that does not say who it is, and whose converter is not there. */
export const Anonymous = { '~standard': { version: 1, validate: (value: unknown) => ({ value }), jsonSchema: {} } };

/** A converter that throws something that is not an Error. */
export const Throws = {
  '~standard': {
    version: 1,
    vendor: 'odd',
    validate: (value: unknown) => ({ value }),
    jsonSchema: {
      input: () => {
        throw 'no';
      },
      output: () => ({ type: 'string' }),
    },
  },
};

/** A plain object, not a schema at all. */
export const Plain = { type: 'string' };
