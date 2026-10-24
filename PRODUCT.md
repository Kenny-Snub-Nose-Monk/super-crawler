# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Foreign professionals who have moved to Taiwan for work (typically higher-income, often Gold Card or specialist-talent holders), reading in English. The site is public: anyone with the URL can use it, on phone or desktop.

Their main job is understanding their own Taiwan tax position: whether they are a resident this tax year, roughly what they will owe, and what is due when. Their secondary job is finding things to do in Taipei and New Taipei (outdoor challenges, English-language exchanges, weekend music, markets and exhibitions).

## Product Purpose

Ma is a static site with two parts: a tax guide plus calculator for foreigners in Taiwan, and a Taipei events finder. **Tax is the main part.** Events are the reason people come back between tax seasons.

For a foreigner, almost all of their tax depends on one number: how many days they spent in Taiwan during a tax year. The site puts that question first. It decides resident vs non-resident status from a day count or from a list of entry and exit dates, then estimates the tax. The Ministry of Finance's own calculator skips that residency step.

Success: readers know their residency status, have a rough estimate they can trust, know the next deadline, and can trace every figure back to the official source.

## Positioning

Every tax figure on the site is pinned to a quoted sentence from an official source snapshot (Ministry of Finance, National Taxation Bureau, gazette, law database, Ministry of Labor, Talent Taiwan). A crawler re-fetches those sources every week and checks each quote. Any figure whose quote no longer matches is shown as "needs review" instead of being silently trusted (ADR 0003).

The event listings are crawled from several sources and normalized into one table. Uncertainty is shown as "unknown" rather than guessed.

## Operating Context

- Static single-page site with hash routing, deployed on GitHub Pages (`https://kenny-snub-nose-monk.github.io/super-crawler/`). There is no server.
- Data comes from crawlers that run on GitHub Actions every Thursday night and commit their results back. The site may be opened days after the last export, so time-based status is recomputed when the page loads.
- Tax content follows the Taiwan tax calendar: the January–December tax year, the May filing season, three refund batches, and annual amount announcements.
- AI assistants can query the site through WebMCP (`?relay=1` or the header's "Connect Claude"). Its 8 tools drive the page to the same result the user sees (ADR 0002).

## Capabilities and Constraints

- Tax: 1 overview guide plus 5 in-depth guides (183-day rule, rates, how to file, employer withholding, Gold Card / specialist benefits, equity and overseas income); a residency check and tax calculator; a tax calendar; a guide for English-friendly Taipei.
- Events: search with natural filters (this weekend, free, English), topics, saved events, event series with their other sessions.
- The calculator hard-codes no amounts. Parameters come from `content/tax/facts.yaml` through the export, and every result line carries its fact id. Deliberately out of scope (and stated on screen with a link to the official calculator): spouse combined vs separate filing, itemized deduction details, foreign tax credit, the two dividend taxation methods.
- Event titles are never machine-translated. If a source has an English title, it is shown with an extra "Listed as <original>" line; otherwise the original title is shown.
- External text is rendered with `textContent` only.
- Domain vocabulary lives in `CONTEXT.md`.
- Open (not binding for a redesign): the name "Ma" and the English-only interface rule. The user did not mark either as a must-keep.

## Brand Commitments

- **Traceability:** every number must stay traceable to its official quote, with its verification status visible ("needs review" stays visible). Required through any redesign.
- **Connect Claude (WebMCP):** the entry point and its tools must survive any redesign.
- Current footer stance: "General information, not advice for your situation. Confirm with the National Taxation Bureau before you file."

## Evidence on Hand

- `content/tax/facts.yaml`: tax figures with official quotes; `data/tax/snapshots/`: 230+ official page snapshots.
- `content/guides/*.yaml`: 7 written guides.
- `data/events.jsonl`: about 900 crawled events from 7 sources (Taipei Travel API, Accupass, Taiwan Pathfinder, anncr, Trendy Taipei, Meetup, Talent Taiwan).
- No testimonials, user counts, press or partnerships exist; do not fabricate them. Most events have no images, so the site generates its illustrations.

## Product Principles

1. Residency first. The day count decides everything else, so it comes before any tax number.
2. Show the source. Each figure carries its quote and verification status, and uncertainty is stated, never hidden.
3. Information before atmosphere. A reader should get the answer at a glance.
4. Same answer for people and AI. What an assistant finds through WebMCP is what the page shows.
5. Never pretend to be advice. Point to the official authority for anything the site deliberately does not cover.

## Accessibility & Inclusion

Secondary text contrast is at least 4.5:1. No page may scroll horizontally at 375px width. Readers are non-native in Chinese, so Chinese appears only as content (original titles, official quotes, glossary), always labeled.
