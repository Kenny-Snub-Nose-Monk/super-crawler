---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: []
---

---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: []
---

---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: []
---

# Surface: Ma — home + tax (home, tax hub, guides, calculator)

Mode: operate (home day-count tool, calculator) with read sub-surfaces (guides). Round 1 (2026-10-23): home, #/tax, #/guide/*, #/calculator. Round 2 (2026-10-23): #/events, #/event/*, #/topics, #/topic/*, #/saved, #/search, #/about rebuilt in the same world as an extension (no new direction round).

Audience/job: foreign professionals in Taiwan; first question is "how many days this tax year", then status, estimate, next deadline. Must keep: every figure traceable to official quote + verification status; Connect Claude (WebMCP) entry and tool behaviour. Avoid: government-form stiffness, generic SaaS cards/icon tiles/gradients, decoration that hurts reading, tourist Taiwan motifs.

## Direction contract

THESIS: The tax year laid out like a Swiss-school annual report: one strict 12-column grid, figures at report scale, every number footnoted to its official source. Refuses the fintech hero + calculator card + three feature cards.

OWN-WORLD: Cool coated-white ground (#f5f5f2), ink black, one signal red (#e1251b) as overprint that owns answers and filled days, warm grey rules, a muted report blue for note marks only. Archivo (variable width) — condensed heavy for figures, normal for text; tabular numerals. Flat: no shadows, no radius, no gradients, no icon tiles. Hairline and 2px ink rules divide; sections numbered like report chapters.

STORY: Visitor types days (or trips), watches the year fill, reads Resident/Non-resident at headline scale, sees next deadline, moves to the estimate; every figure's note mark opens its quote.

FIRST VIEWPORT: 2px-ruled top bar (Ma., Tax/Guides/Calculator/Calendar/Events, Connect Claude outlined). Left 5 cols: question at 64px + giant numeric input. Right 6 cols: 12×31 day grid with ruled 183 line. Bottom band of three report figures: status (red), next deadline, estimate link.

FORM: Annual Report Grid, #6 on the ordered list; seed:cd267716c06b8ec9. Raises: fixed-capacity year (j-card), fixed figure columns that update in place (split-flap), one question owns viewport (vertical feed), stable fact catalog numbers as note marks (catalog sleeve), claim beside proof (mono marketing).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: day grid fills cell by cell (staggered, reduced-motion = instant) as the number changes; 183 rule turns red when crossed. Motion grammar: short 160–220ms ease-out, no bounces, no scroll reveals.

## Round 2: events, topics, saved, search (extension)

Mode: operate. The world lends type, palette, density and one signature move; controls stay standard web controls. Signature move: the day-grouped agenda, with a big condensed day numeral per day, a sticky day heading, time-only rows, a red TODAY/TOMORROW slab, and a 4px-ruled month heading at each month change. The events page uses a sticky left filter rail (a details panel at ≤900px) and a report-scale count figure. Generated illustrations are gone from event lists, cards and detail; the date is the visual. Event detail: large date figure, a ruled facts list with no icons, and a ruled cost block (not a card). Unknowns stay worded plainly ("Price not listed", "Location not listed").
