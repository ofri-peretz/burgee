import { BrandMark } from '#/components/brand-mark';
import Link from 'next/link';

/** Hero mark: 4× the nav size, the same locked geometry. */
const HERO_MARK_SIZE = 96;

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandMark size={HERO_MARK_SIZE} />
      <h1 className="text-4xl font-bold tracking-tight">
        <span className="font-mono lowercase">interlace</span> CLI
      </h1>
      <p className="max-w-xl text-lg text-fd-muted-foreground">
        The layer above argv parsing. Built on commander and yargs, never replacing them.
        One schema, a JSON envelope on every command, an exit-code contract, and a
        manifest an AI agent reads in a single call.
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
