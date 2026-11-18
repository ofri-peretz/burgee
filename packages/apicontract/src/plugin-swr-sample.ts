/**
 * The `swr` target's sample (R-PL5): a small document and exactly what it produces, written out
 * so it can be read without running anything. `checkPlugin` proves the generator still writes it.
 */

/** The sample document. */
export const document = {"openapi":"3.1.0","paths":{"/pets":{"get":{"operationId":"listPets","responses":{}},"post":{"operationId":"createPet","responses":{}}}}};

/** `swr.ts` for it. */
export const SAMPLE_SWR = `import { type Client, type CreatePetInput, type ListPetsInput } from "./client.js";

/** A value with its object keys sorted at every depth: the same input in any property order is the same key. */
export const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Readonly<Record<string, unknown>>;
  return Object.fromEntries(Object.keys(record).sort().map((name) => [name, stable(record[name])]));
};

export const createPetSWRMutation = (client: Client) => ({
  key: ["createPet"] as const,
  fetcher: async (_key: unknown, { arg }: { readonly arg: CreatePetInput }) => client["createPet"](arg),
});

export const listPetsSWR = (client: Client, input: ListPetsInput = {}) => ({
  key: ["listPets", stable(input)] as const,
  fetcher: async () => client["listPets"](input),
});
`;
