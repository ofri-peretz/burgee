# Docs traffic, 30 days to 2026-10-10

Source: PostHog project 428927, `$pageview` where `properties.app = 'burgee-docs'` (registered by
`apps/docs-chassis/src/analytics.tsx` with `site` and `host`). Read-only HogQL, run 2026-10-10.

## Volume per site

| site | views | people |
| :-- | --: | --: |
| burgee | 61 | 14 |
| flagstaff | 20 | 18 |
| controlroom | 16 | 10 |
| bellpull | 14 | 7 |
| seniority | 12 | 4 |
| roundel | 11 | 6 |
| paratext | 7 | 7 |
| linegauge | 6 | 5 |
| caique | 5 | 3 |
| closeout | 3 | 3 |
| **all ten** | **155** | |

## Where readers come from

| referrer | views |
| :-- | --: |
| direct | 91 |
| www.npmjs.com | 28 |
| github.com | 18 |
| bing.com | 17 |
| google | **0** |

## Top pages

Home pages dominate (burgee 14, controlroom 12, flagstaff 8, roundel 7, bellpull 7, paratext 7),
then `/docs` landings and `burgee/docs/compatibility` (5) and `burgee/docs/packages/burgee` (5).

## What it means

1. **The volume is too low to rank content gaps.** 155 views across ten sites cannot tell a weak
   page from an unvisited one, so the queue item "fix the five worst content gaps" is not
   supported by this data and no content was changed on its strength. The search box sends no
   event, so zero-result queries cannot be read at all.
2. **Discovery is the bottleneck, not the docs.** npm (28) and GitHub (18) are the largest real
   sources, so the npm description and README (rewritten in #938) and the GitHub repo page (whose
   homepage link 404s, see `github-page-draft.md`) are the highest-value surfaces.
3. **Google sends nothing while Bing sends 17.** The sites are indexable (robots `Allow: /`,
   canonical set, 56-URL sitemap) but carry no `google-site-verification`, so the sitemaps were
   likely never submitted. Owner action: verify `interlace.tools` as a Domain property in Google
   Search Console (one DNS TXT record at Namecheap) and submit the ten `/sitemap.xml` URLs.
4. **Instrument search.** A `docs_search` event with the query and result count would make the
   next read of this file actionable.
