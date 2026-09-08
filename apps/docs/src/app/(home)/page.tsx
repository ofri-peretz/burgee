import { BurgeeMark } from '#/components/burgee-mark';
import Link from 'next/link';

/** Hero burgee: 4× the nav size, the same locked geometry. */
const HERO_MARK_SIZE = 96;

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <BurgeeMark size={HERO_MARK_SIZE} />
      <h1 className="text-4xl font-bold tracking-tight">
        <span className="font-mono lowercase">burgee</span>
      </h1>
      <p className="max-w-xl text-lg text-fd-muted-foreground">
        Everything a CLI needs that isn&apos;t your CLI: help, structured output, a typed
        schema, an MCP server, completions, types and docs — every one of them projected
        from a single declaration. You write the commands; humans and agents both get a
        first-class interface to them.
      </p>
      <Link
        href="/docs"
        className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground"
      >
        Read the floor
      </Link>
    </main>
  );
}
