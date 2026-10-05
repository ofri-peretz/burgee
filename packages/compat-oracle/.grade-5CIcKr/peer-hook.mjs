// generated per run — COMPAT_TARGET=target-package
import { registerHooks } from 'node:module';
const alias = null;
const url = "node:path";
const peers = ["the-peer"];
const inside = "file:///Users/ofri/repos/ofriperetz.dev/burgee/.claude/worktrees/agent-ac2d2773cc62503e1/packages/compat-oracle/.grade-5CIcKr/target-package/";
const from = "file:///Users/ofri/repos/ofriperetz.dev/burgee/.claude/worktrees/agent-ac2d2773cc62503e1/packages/compat-oracle/.grade-5CIcKr/fake/package.json";
const peer = (specifier) => peers.some((name) => specifier === name || specifier.startsWith(`${name}/`));
registerHooks({
  resolve: (specifier, context, next) =>
    specifier === alias ? { url, shortCircuit: true } : peer(specifier) && context.parentURL?.startsWith(inside) === true ? next(specifier, { ...context, parentURL: from }) : next(specifier, context),
});
