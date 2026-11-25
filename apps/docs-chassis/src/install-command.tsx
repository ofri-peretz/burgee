/**
 * The install line on a package site's home: the command a reader came to copy, with a copy
 * button and a choice of package manager under it. Interlace's CodeWindow, cut down to the one
 * line a home page needs.
 *
 * The choice is the same setting as the docs' install tabs (`remark-install-tabs.mjs`): one
 * `package-manager` group, kept in the browser, so a reader who picked pnpm on a guide sees
 * `pnpm add` here too. The server HTML carries the npm line, which is the line every README and
 * `.md` page gives, so the command is there with no script.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'fumadocs-ui/components/ui/tabs';

import { CopyButton } from './copy-button';
import { PACKAGE_MANAGER_GROUP } from './remark-install-tabs.mjs';

/** Each manager's add command, as `remarkNpm` translates `npm install <name>` on the docs pages. */
const MANAGERS = [
  { id: 'npm', verb: 'npm install' },
  { id: 'pnpm', verb: 'pnpm add' },
  { id: 'yarn', verb: 'yarn add' },
  { id: 'bun', verb: 'bun add' },
] as const;

export function InstallCommand({ name }: { readonly name: string }) {
  return (
    <Tabs groupId={PACKAGE_MANAGER_GROUP} persist defaultValue="npm" data-slot="home-install" className="flex w-full max-w-md flex-col items-center gap-2">
      {MANAGERS.map(({ id, verb }) => {
        const command = `${verb} ${name}`;
        return (
          <TabsContent
            key={id}
            value={id}
            data-slot="home-install-line"
            className="flex w-full items-center gap-2 rounded-lg border bg-fd-card py-1.5 pr-1.5 pl-4 text-left font-mono text-sm shadow-sm"
          >
            <span aria-hidden="true" className="select-none text-fd-muted-foreground">
              $
            </span>
            <code data-testid="home-install-command" data-slot="home-install-command" className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
              {command}
            </code>
            <CopyButton text={command} id="home-install-copy" />
          </TabsContent>
        );
      })}
      <TabsList aria-label="Package manager" data-slot="home-install-managers" className="flex gap-1 font-mono text-xs">
        {MANAGERS.map(({ id }) => (
          <TabsTrigger
            key={id}
            value={id}
            data-testid={`home-install-${id}`}
            data-slot="home-install-manager"
            className="rounded-md px-2 py-1 text-fd-muted-foreground transition-colors hover:text-fd-foreground data-[state=active]:bg-fd-muted data-[state=active]:text-fd-foreground"
          >
            {id}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
