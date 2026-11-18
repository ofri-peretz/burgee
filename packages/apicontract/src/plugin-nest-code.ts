/**
 * The files `gen nest` writes (apicontract-servers R1, R2, R5): per controller, the abstract base
 * (generated) and the class that extends it (the user's, written once); one module listing every
 * controller; and `contract-runtime.ts`, the validation and Problem Details helpers the bases call.
 *
 * NestJS, the `types` target's output and the `validator` target's output are imported by the
 * generated code, never by apicontract. Every spec-derived string goes through `literal`
 * (`plugin-server-code.ts`).
 */
import { type Imports, lines, literal, operationTypes, partsOf, pascal, readAs, routePath, stubResponse, where } from './plugin-server-code.js';
import { type Controller, type Route } from './plugin-server-routes.js';

const DECORATORS: Readonly<Record<string, string>> = { get: 'Get', put: 'Put', post: 'Post', delete: 'Delete', options: 'Options', head: 'Head', patch: 'Patch' };

/** The decorated method that receives the request, validates it, calls the user's method and sends what it returns. */
const handler = (route: Route): string[] => {
  const validator = (payload: string): string => `validators[${literal(route.id)}][${literal(payload)}]`;
  const parts = partsOf(route);
  const DECORATED = { path: '@Param() path: Record<string, unknown>', query: '@Query() query: Record<string, unknown>', header: '@Headers() header: Record<string, unknown>' };
  const parameters = [...parts.map((part) => DECORATED[part]), ...(route.body === undefined ? [] : ['@Body() body: unknown']), '@Res({ passthrough: true }) reply: Reply'];
  const input = [
    ...parts.map((part) => {
      const fields = route.params.filter((param) => param.part === part).map((param) => `${literal(param.name)}: coerce(${part}[${literal(readAs(part, param.name))}], ${literal(param.kind)})`);
      return `      ${part}: { ${fields.join(', ')} },`;
    }),
    ...(route.body === undefined ? [] : ['      body,']),
  ];
  const fields = [
    ...route.params.map(
      (param) =>
        `      { pointer: ${literal(`/${param.part}/${param.name}`)}, value: input.${param.part}[${literal(param.name)}], required: ${String(param.required)}, check: ${validator(param.payload)} },`,
    ),
    ...(route.body === undefined ? [] : [`      { pointer: "/body", value: input.body, required: ${String(route.body.required)}, check: ${validator(route.body.payload)} },`]),
  ];
  const responses = route.responses.map(({ status, content }) => {
    const declared = content === undefined ? '{}' : `{ media: ${literal(content.media)}, check: ${validator(content.payload)} }`;
    return `      ${literal(status)}: ${declared},`;
  });
  return [
    `  /** ${where(route)}: validates the request, calls \`${route.name}\`, and checks what it answers. */`,
    `  @${DECORATORS[route.method] as string}(${literal(routePath(route.path))})`,
    `  async ${route.handler}(${parameters.join(', ')}): Promise<unknown> {`,
    '    const input = {',
    ...input,
    '    };',
    '    const errors = invalid([',
    ...fields,
    '    ]);',
    "    if (errors.length > 0) return problem(reply, 400, 'Bad Request', 'The request does not match the contract.', errors);",
    `    return send(reply, await this.${route.name}(input as unknown as ${pascal(route.name)}Input), {`,
    ...responses,
    '    });',
    '  }',
  ];
};

/** `<file>.controller.base.ts`: the types of each route and the abstract controller, rewritten every run. */
export const baseFile = (controller: Controller, imports: Imports): string => {
  const decorators = new Set<string>(['Res']);
  for (const route of controller.routes) {
    decorators.add(DECORATORS[route.method] as string);
    if (route.params.some((param) => param.part === 'path')) decorators.add('Param');
    if (route.params.some((param) => param.part === 'query')) decorators.add('Query');
    if (route.params.some((param) => param.part === 'header')) decorators.add('Headers');
    if (route.body !== undefined) decorators.add('Body');
  }
  // Only what is used is imported: a project compiled with `noUnusedLocals` stays clean.
  const coerced = controller.routes.some((route) => route.params.length > 0);
  const validated = coerced || controller.routes.some((route) => route.body !== undefined || route.responses.some((response) => response.content !== undefined));
  return lines(
    `import { ${[...decorators].toSorted().join(', ')} } from '@nestjs/common';`,
    '',
    `import { ${[...(coerced ? ['coerce'] : []), 'invalid', 'problem', 'type Reply', 'send'].join(', ')} } from './contract-runtime.js';`,
    `import { type paths } from ${literal(imports.types)};`,
    ...(validated ? [`import { operations as validators } from ${literal(imports.validators)};`] : []),
    '',
    ...controller.routes.flatMap((route) => [...operationTypes(route), '']),
    '/**',
    ` * Every \`${controller.file}\` route. Extend it with a class decorated \`@Controller()\` and implement each method:`,
    ' * a new operation in the spec is a new abstract method, so the extending class stops compiling until it has one.',
    ' */',
    `export abstract class ${controller.name}ControllerBase {`,
    ...controller.routes.flatMap((route) => [
      `  /** ${where(route)}. */`,
      `  abstract ${route.name}(input: ${pascal(route.name)}Input): ${pascal(route.name)}Output | Promise<${pascal(route.name)}Output>;`,
      '',
    ]),
    ...controller.routes.flatMap((route, index) => [...(index === 0 ? [] : ['']), ...handler(route)]),
    '}',
  );
};

/** `<file>.controller.ts`: the user's controller, written once, answering each operation with the spec's example. */
export const controllerFile = (controller: Controller): string =>
  lines(
    '/**',
    ` * The \`${controller.file}\` routes. apicontract wrote this file once and never rewrites it: change it freely.`,
    ` * \`${controller.name}ControllerBase\` (${controller.file}.controller.base.ts, regenerated) declares one method per`,
    ' * operation and validates every request and response; each method here answers the spec\'s example until you replace it.',
    ' */',
    "import { Controller } from '@nestjs/common';",
    '',
    `import { ${[`${controller.name}ControllerBase`, ...controller.routes.flatMap((route) => [`type ${pascal(route.name)}Input`, `type ${pascal(route.name)}Output`])].join(', ')} } from './${controller.file}.controller.base.js';`,
    '',
    '@Controller()',
    `export class ${controller.name}Controller extends ${controller.name}ControllerBase {`,
    ...controller.routes.flatMap((route, index) => [
      ...(index === 0 ? [] : ['']),
      `  /** ${where(route)}. */`,
      `  ${route.name}(_input: ${pascal(route.name)}Input): ${pascal(route.name)}Output {`,
      `    ${stubResponse(route)}`,
      '  }',
    ]),
    '}',
  );

/** `api.module.ts`: every controller, in one module the application imports. */
export const moduleFile = (controllers: readonly Controller[]): string =>
  lines(
    "import { Module } from '@nestjs/common';",
    '',
    ...controllers.map((controller) => `import { ${controller.name}Controller } from './${controller.file}.controller.js';`),
    '',
    '/** Every controller generated from the spec. Import it into your application\'s module. */',
    `@Module({ controllers: [${controllers.map((controller) => `${controller.name}Controller`).join(', ')}] })`,
    'export class ApiModule {}',
  );
