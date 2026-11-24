/**
 * The top of a package site's home, after Interlace's Hero: the mark, the name as the page's one
 * h1 on a fluid display size (44 to 64px on one curve, as Interlace's `text-display`), the npm
 * description at a readable measure, and the two things a reader came for side by side, the docs
 * and the install command. On a phone they stack at full width.
 */
import Link from 'next/link';
import { type ReactNode } from 'react';

import { InstallCommand } from './install-command';
import { type Site } from './site';

/** Hero mark: 4× the nav size. */
const HERO_MARK_SIZE = 96;

export function homeHero(site: Site): ReactNode {
  return (
    <section aria-labelledby="home-title" data-slot="home-hero" className="flex flex-col items-center gap-6 px-4 pt-16 pb-12 text-center sm:px-6 sm:pt-24 sm:pb-16">
      <img src="/icon.svg" alt="" width={HERO_MARK_SIZE} height={HERO_MARK_SIZE} />
      <h1 id="home-title" className="text-[clamp(2.75rem,2rem+3vw,4rem)] leading-none font-bold tracking-tight">
        <span className="font-mono lowercase">{site.name}</span>
      </h1>
      <p className="max-w-[60ch] text-lg text-balance text-fd-muted-foreground sm:text-xl">{site.description}</p>
      <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
        <Link
          href="/docs"
          data-testid="home-docs"
          data-slot="home-docs"
          className="inline-flex h-11 w-full max-w-md shrink-0 items-center whitespace-nowrap justify-center rounded-lg bg-fd-primary px-5 font-medium text-fd-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring sm:w-auto"
        >
          Read the docs
        </Link>
        <InstallCommand name={site.name} />
      </div>
    </section>
  );
}
