/**
 * The install line on a package site's home: the command a reader came to copy, in the server
 * HTML as plain text, with a copy button that only adds to it. Interlace's CodeWindow, cut down
 * to the one line a home page needs (content first: no script, the command is still there).
 */
import { CopyButton } from './copy-button';

export function InstallCommand({ name }: { readonly name: string }) {
  const command = `npm install ${name}`;
  return (
    <div data-slot="home-install" className="flex w-full max-w-md items-center gap-2 rounded-lg border bg-fd-card py-1.5 pr-1.5 pl-4 text-left font-mono text-sm shadow-sm">
      <span aria-hidden="true" className="select-none text-fd-muted-foreground">
        $
      </span>
      <code data-testid="home-install-command" data-slot="home-install-command" className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
        {command}
      </code>
      <CopyButton text={command} id="home-install-copy" />
    </div>
  );
}
