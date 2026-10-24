---
name: Ma
description: Taiwan tax for foreign professionals, laid out like an annual report with every figure footnoted to its official source.
colors:
  paper: "#f5f5f2"
  paper-2: "#ebebe5"
  sheet: "#fbfbf9"
  cell: "#e0e0d9"
  ink: "#151515"
  ink-2: "#3d3d39"
  ink-3: "#5c5c56"
  rule: "#cacac3"
  red: "#e1251b"
  red-ink: "#b31910"
  red-soft: "#fbe4e1"
  red-wash: "#f0a39d"
  red-on-ink: "#ff6a5f"
  blue: "#2b4c7e"
  blue-soft: "#dfe6f0"
  blue-line: "#9fb0cc"
  green-ink: "#1f6a3d"
typography:
  hero-figure:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "clamp(96px, 10.5vw, 152px)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
    fontVariation: "'wdth' 75"
  display:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "clamp(38px, 4.7vw, 66px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 85"
  figure:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "clamp(30px, 3.1vw, 44px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 85"
  count-figure:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "56px"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
    fontVariation: "'wdth' 75"
  headline:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  title:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 95"
  body:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
  note-mark:
    fontFamily: "Archivo, Noto Sans TC, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
    fontFeature: "tnum"
    fontVariation: "'wdth' 100"
rounded:
  none: "0px"
spacing:
  hair: "1px"
  rule: "2px"
  month-rule: "4px"
  column-gap: "24px"
  gutter: "48px"
  gutter-tablet: "32px"
  gutter-phone: "16px"
  page-top: "56px"
  chapter: "72px"
  wrap: "1320px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "38px"
  button-outline-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  segment-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  input-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "44px"
  input-days:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.hero-figure}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  figure-value:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
  figure-value-answer:
    textColor: "{colors.red}"
    typography: "{typography.figure}"
  note-mark:
    textColor: "{colors.blue}"
    typography: "{typography.note-mark}"
    padding: "0 2px"
  note-mark-drifted:
    textColor: "{colors.red-ink}"
  flag-label:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
  year-cell:
    backgroundColor: "{colors.cell}"
    height: "18px"
  year-cell-filled:
    backgroundColor: "{colors.red}"
  year-cell-projected:
    backgroundColor: "{colors.red-wash}"
  day-numeral:
    textColor: "{colors.ink}"
    width: "148px"
  day-slab:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
  month-heading:
    textColor: "{colors.ink}"
    padding: "10px 0 12px"
  count-value:
    textColor: "{colors.ink}"
    typography: "{typography.count-figure}"
  save-toggle:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    size: "36px"
  save-toggle-pressed:
    textColor: "{colors.red}"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "2px 7px"
  tag-english:
    textColor: "{colors.blue}"
  tag-new:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
  fact-popover:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px 18px 18px"
    width: "min(420px, calc(100vw - 32px))"
---

# Design System: Ma

## Overview

**Creative North Star: "The Annual Report Grid"**

The tax year is typeset like a Swiss-school annual report. One strict 12-column grid, figures set at report scale in condensed heavy Archivo, and every number carries a small blue note mark (F1, F24, F63) that opens the official sentence it comes from. The page is a sheet of coated white paper printed in ink black, with one signal red overprinted only where the reader's answer, filled days, or current position is.

Structure comes from rules, not containers. A 2px ink rule opens every chapter, figure band, fieldset and result block; 1px warm-grey hairlines separate rows inside them. There are no cards, no rounded corners and no tinted panels except two quiet callout washes. Density is report-like: generous vertical air between chapters (72px), tight leading inside figures, numbers sized to be read across a room.

Motion is brief and mechanical: 160 to 220ms with a fast ease-out, never a bounce, never a scroll reveal. The one signature movement is the year grid filling cell by cell (staggered over at most 260ms, instant under reduced motion) as the day count changes.

Scope of this record: every route is composed in this world. Round 1 built the home page, tax hub (#/tax), guides (#/guide/*) and calculator (#/tax/calculator); round 2 rebuilt events, event detail, topics, topic, saved, search and about as an extension of the same system. On the event surfaces the date is the visual: no illustrations, a big condensed day numeral instead.

**Key Characteristics:**
- One 12-column grid with 24px gaps; chapters put the title in columns 1 to 3 and the content in 4 to 12.
- Condensed heavy numerals with tabular figures for every quantity.
- Every figure footnoted with a blue F-number that opens its official quote.
- Flat paper and ink; division by 2px and 1px rules only.
- One red, used as an overprint for answers, filled days and "you are here".
- Dated lists read as an agenda: one big day numeral per day, time-only rows, a heavier rule at each month.

## Colors

Coated paper, ink, one overprint red, and a muted report blue reserved for provenance.

### Primary
- **Signal Red** (red): the overprint. Filled days in the year grid, the "Resident" answer, the 183-day line once crossed, the active nav underline, the "next" calendar pill and "Start here" flag, the current-section square in the guide contents, step counters, square list bullets, focus outlines and text selection. On the event surfaces: the TODAY / TOMORROW slab on a day heading, the "On now" date figure on event detail, the "New" tag, a pressed bookmark, and the reader's own query in the search heading.
- **Press Red** (red-ink): red for small text, where Signal Red would fall under 4.5:1. Next calendar date, drifted figures, hover on titles and links, guide section numbers, the active-filter count on the filter rail, "On now" and "Until" on ongoing rows.
- **Red Wash** (red-wash): projected days in the year grid (filled days that fall after today).
- **Red Tint** (red-soft): warning callouts, search-hit highlight, the row flash after an agent action.
- **Red on Ink** (red-on-ink): the one red for text on an ink ground, where Press Red would vanish. Today only the "Resident" word in the phone calculator's ink summary bar.

### Secondary
- **Report Blue** (blue): provenance only. F-number note marks, the verified square, the "Law" callout label, the "saved" status pill in the About source tables, and the language-access marker on the English-friendly tag.
- **Note Tint** (blue-soft): hover ground for inline fact figures in guide prose.
- **Note Underline** (blue-line): the 2px underline under an inline fact figure in guide prose, marking it as a figure that opens its source.

### Tertiary
- **Ledger Green** (green-ink): one job only, the calculator's "this saves you" effect line.

### Neutral
- **Coated Paper** (paper): the page ground, masthead and dock.
- **Second Sheet** (paper-2): callout and quote grounds, future empty cells in the year grid, segmented-control hover, inline code.
- **Fresh Sheet** (sheet): surfaces the reader writes on or that float: form fields, search bar, the fact popover.
- **Empty Cell** (cell): past empty day cells and empty comparison bars.
- **Ink** (ink): text, 2px rules, primary buttons, selected states.
- **Ink 2** (ink-2): secondary text, ledes, table body.
- **Ink 3** (ink-3): labels, captions, hints, past items (the lightest text allowed; meets 4.5:1 on paper).
- **Warm Rule** (rule): 1px hairlines between rows, chip, tag, pill, hint and bookmark borders.

### Named Rules
**The One Red Rule.** Red marks the reader's answer, filled days and current position. It is never a section ground, a decorative stripe or a brand wash. If red appears, it should be answering "what about me, now?".

**The Blue Is Provenance Rule.** Report blue appears only where a figure points back to its source or its verification. A blue element that does not trace to a fact (or language access) is misusing the colour.

**The Small Red Text Rule.** Text under 24px uses Press Red, never Signal Red.

## Typography

**Display Font:** Archivo, variable width 62 to 125 and weight 400 to 800 (with Noto Sans TC for Chinese content, then system sans)
**Body Font:** Archivo at normal width
**Label/Mono Font:** none distinct; labels are Archivo bold, uppercase, tracked

**Character:** One family carries the whole report. The width axis does the hierarchy: figures and headings narrow to 75 to 88% and go heavy, so large numbers stay compact and columnar, while reading text stays at full width.

### Hierarchy
- **Hero Figure** (800, clamp(96px, 10.5vw, 152px), 0.86, width 75%): the home day-count input only. Tabular numerals.
- **Big Number** (800, clamp(52px, 5.6vw, 76px), 0.95, width 78%): the calculator's estimated tax.
- **Display** (700, clamp(38px, 4.7vw, 66px), 1.02, width 85%): page questions and guide titles; page heads use clamp(40px, 5.4vw, 72px) at line-height 1.
- **Count Figure** (800, 56px, 0.9, width 75%, tabular; 44px under 600px): the count beside a filtered list ("212 events"), Saved chapter counts, and the family of big condensed numerals: the agenda day numeral (64px, 44px on phones), topic counts (48px), event card dates (52px), the event detail date (120px, 88px on phones).
- **Figure** (700, clamp(30px, 3.1vw, 44px), 1.05, width 85%): report figures in the three-up band. Status words in the calculator go to 44px at 800.
- **Headline** (700, 28px, 1.1, width 88%): chapter titles; guide section heads run 30px with a red numeral. Month headings and topic names run 30px at width 85%; the event title is clamp(30px, 3.8vw, 48px) at 88%; the search heading clamp(34px, 4.4vw, 58px) at 85%; the search summary sentence 24px at 88%.
- **Title** (650, 20px, 1.25, width 95%): guide list titles, calendar items (16.5px), event row and card titles (18px). Row times run 19px 700 at width 88%.
- **Body** (400, 17px, 1.55; 16px under 600px): interface text. Guide prose runs 17.5px at 1.7, capped at 68ch.
- **Label** (700, 13px, 0.06em tracking, uppercase): figure labels, sub-heads over tables and lists, the grid caption, contents heading, callout kind. Always belongs to the figure or block directly below it.
- **Note Mark** (700, 12px, width 100%, tabular, superscript; 13px beside figures): F-numbers.

### Named Rules
**The Tabular Rule.** Every number a reader might compare (days, money, dates, rates, counts, F-numbers) is set with tabular numerals.

**The Width Axis Rule.** Hierarchy comes from width and weight together: the bigger the number, the narrower the face. Reading text never narrows.

## Layout

A centred wrap of 1320px plus a 48px gutter on each side (32px under 1100px, 16px under 600px). Chapters and the home question sit on a 12-column grid with 24px column gaps and zero row gap. Each chapter opens with a full-width 2px ink rule, then title and aside note in columns 1 to 3, content in 4 to 12; under 900px both stack to full width. Chapters are 72px apart (56px under 900px); page heads start 56px below the masthead (36px on phones).

The home first viewport: question and hero input in columns 1 to 5, year grid in columns 7 to 12, then a full-width band of three figures under a 2px rule. Figure bands are always three equal columns, stacking to one with 1px rules between them under 900px. Guides use a 220px sticky contents column beside a 720px reading column; the calculator uses a form column beside a 460px sticky result column. Every single-column grid uses minmax(0, 1fr) so nothing scrolls sideways at 375px.

The events page is a browse grid on the same 12 columns: the filter rail in columns 1 to 3 (sticky 84px below the top, scrolling inside itself), the count, sort and agenda in 4 to 12. An agenda day is a 148px heading column beside its rows, 24px apart, under a 2px rule; days sit 28px apart and a month heading opens 48px above the next month. Event detail is a reading column beside a 340px aside (64px gap). Topic rows split 4 / 6 / 2 (name, description, count). Event cards run four across, three under 1100px, two under 900px, one under 600px.

Under 900px the rail becomes a closed details panel above the list, the aside goes static, and event detail gains a fixed cost-and-action bar above the dock. Under 600px the day heading turns into one inline line (numeral, weekday, slab) that sticks 58px below the top on a paper ground, and the About source tables stack into labelled blocks.

Breakpoints: 1100px (tighter gutter and nav), 900px (stack everything, hide nav for the bottom dock, sticky calculator summary bar), 600px (phone sizes).

## Elevation & Depth

Flat. Depth comes from the weight of rules: 2px ink rules open a block, 1px hairlines divide inside it, and the 3px ink baseline under the day input marks the one place to type. Inset strokes (box-shadow inset) are used as rules, for the 183-day cell outline, the ghost button and segmented dividers; they are part of the line vocabulary, not elevation.

The only cast shadows belong to the two layers that float free of the page: the fact popover and the agent toast. They are soft and ambient, never offset. Fixed bars (the dock, the phone event cost bar) separate from the page with a top rule, not a shadow.

### Shadow Vocabulary
- **Popover lift** (`box-shadow: 0 14px 36px rgba(21, 21, 21, .14)`): the fact popover, which also carries a 1.5px ink border.
- **Toast lift** (`box-shadow: 0 10px 30px rgba(21, 21, 21, .18)`): the agent action toast on its ink ground.

### Named Rules
**The Rules Not Boxes Rule.** Nothing in the page flow casts a shadow or sits in a filled card. Group with a 2px rule above; separate with 1px hairlines.

## Shapes

Square everything (0px radius, enforced on form fields). Marks are solid squares: the 7px brand dot, 8px list bullets, the relay status dot, the verified square, the toast mark. Strokes come in a fixed set: 1px hairline, 1.5px control outline, 2px block rule, 3px active underline (nav, tabs) and input baseline, 4px month rule (the heaviest line, used only where the agenda changes month). A dashed 1px border marks an unknown value on a tag. SVG line icons use square caps and mitred joins at 1.8 stroke; disclosure marks are drawn in CSS (the filter rail's 2px chevron).

## Components

### Buttons
Plain ink slabs and ink outlines; they change colour, never shape.
- **Shape:** square corners (0px).
- **Primary:** ink ground, paper text, 46px tall, 20px side padding, 650 weight.
- **Hover / Focus:** primary turns Signal Red over 160ms; focus is a 2px red outline offset 2px.
- **Outline:** transparent with a 1.5px ink border (Connect Claude, "Show more", ghost buttons); fills ink with paper text on hover. Connect Claude, when on, stays filled and its square status dot turns red.

### Segmented control
- **Style:** one 1.5px ink outline with 1.5px inset dividers; options 8px by 14px at 14.5px.
- **State:** selected fills ink with paper text at 650 weight; hover takes the second sheet.

### Chips
- **Style:** 36px tall, 1px warm-rule border, transparent, ink-2 text.
- **State:** hover borders ink; selected fills ink with paper text. Flag labels ("Start here", "In 7 days") are red-filled 12px uppercase slabs.

### Cards / Containers
There are no boxed cards. Blocks are a 2px top rule plus content (figures, result blocks, fieldsets, key points, comparisons, the event cost block, the search summary, empty states). Callouts are the one filled container: second-sheet ground (red tint for warnings), 16px by 18px padding, a 100px uppercase kind label column.

### Inputs / Fields
- **Style:** 44px, 1.5px ink-3 border, square, fresh-sheet ground, tabular numerals.
- **Focus:** 2px red outline offset 1px, border goes ink.
- **Day input:** no box at all; the hero figure sits on a 3px ink baseline that turns red on focus, with the unit word at 22px beside it.

### Navigation
Masthead 64px, paper ground, 2px ink rule beneath, sticky. Wordmark "Ma" at 26px 800 width 85% with a red square dot. Links 15px 500 ink-2; current page goes ink at 650 with a 3px red underline sitting on the masthead rule. Search is an underlined field, not a box. Under 900px the links move to a five-item bottom dock with a 2px top rule; the current item turns Press Red.

### Tags and bookmark
- **Tags:** 12.5px 650 slabs, 2px by 7px, 1px warm-rule border. Free borders ink; English-friendly borders and reads blue; New fills Signal Red; online goes ink-3; an unknown value is dashed and ink-3 at 500.
- **Bookmark:** a 36px square with a 1px warm-rule border and an SVG bookmark; hover borders ink; pressed turns red with the icon filled.

### Report figure
Label (uppercase 13px), value (figure scale, red only when it is the reader's answer), a note mark, and one line of explanation capped at 38ch. As a link, the value turns red on hover.

### Year grid (signature)
Twelve month rows of 31 cells (18px tall, 3px gaps; 11px on phones, 9px compact). Past empty cells are Empty Cell, future empty cells Second Sheet, filled days Signal Red, projected filled days Red Wash, today outlined 2px ink. The 183rd cell has an inset ink outline and a 3px vertical bar that overshoots the row; when crossed the bar and key text turn red and the count reads in Press Red. Cells fill in order over at most 260ms.

### Day-grouped agenda (signature)
Every dated list (events, topic, saved, search results) groups by day. Each day opens with a 2px ink rule and a sticky heading: the day numeral at count-figure scale (64px), then the weekday and month at 14px 650 ink-2, and a red TODAY / TOMORROW slab (12px uppercase on Signal Red) when it applies. Ongoing events gather under an "On now" heading. Rows inside a day show the time only (19px 700, "All day" when none). A month change inserts a 30px heading on a 4px ink rule. Pages load more with an outline "Show more" button.

### Event row and event card
- **Row:** a date figure (weekday, 34px day numeral, month) or, inside the agenda, a 76px time column, then type and source in 13.5px ink-3, the title at 18px 650, meta lines with small SVG clock / pin / globe icons, and tags. Title turns Press Red on hover. Past rows grey the title to ink-3.
- **Card:** typographic, no illustration. A 2px ink rule, the date figure (52px numeral) with the time beside it, a 1px hairline, then type, title (clamped to three lines), place and tags. The bookmark sits top right.

### Filter rail
A details element in the rail column: an uppercase FILTERS label with the active count in Press Red, then a stack of 1px-ruled fieldsets of checkboxes (accent red), date fields and a "Clear filters" text link. Open and sticky on desktop; closed under 900px, where the summary becomes a 15px tappable line with a CSS chevron.

### Count figure
The number of results at count-figure scale with a 16px 650 noun beside it ("events", "events in Food"). Saved uses the same numeral under each chapter title ("Coming up", "Guides", "Already happened").

### Event detail
The date is the hero: a 120px day numeral under a 2px rule with the full date line (22px 700) and the sign-up line beside it; ongoing events show "On now" in Signal Red at 56px. Facts are a definition list on a 1px ink rule, one 120px label column, hairline rows, no icons; unknowns are written out ("Location not listed", "Not stated"). The cost block in the aside is ruled, not boxed: 2px rule, COST label, the price at 32px 800, the source line, the primary action and an outline "Add to calendar".

### Search summary
The search heading repeats the query in Signal Red. Results open with a ruled summary (2px rule above, hairline below) whose first line is a 24px heading sentence counting what was found ("14 events this weekend · 6 English-friendly · 3 free.").

### Empty state
A plain sentence at 17px between a 2px ink rule and a hairline, with one text link or button to recover. No illustration, no icon.

### Source tables
Tables open on a 2px ink rule with uppercase 13px headers over a 1px ink line and hairline rows. Under 600px the About tables drop the header and stack each row into a block, each value preceded by its column label in 13px 650 ink-3.

### Note mark and fact popover (signature)
A superscript blue F-number (its stable position in the facts catalogue, identical on every page). Drifted facts turn Press Red with a red "needs review" slab; unchecked facts go ink-3 with an ink-3 slab. Clicking opens a 420px popover on fresh sheet with a 1.5px ink border: status line with the F-number, the value at 28px 800, the label, the official quote on second sheet, and the source link with its check date. Inline figures in guide prose carry a 2px blue-grey underline and open the same popover.

## Do's and Don'ts

### Do:
- **Do** open every chapter, figure band, fieldset and result block with a 2px ink rule, and divide rows with 1px warm-rule hairlines.
- **Do** put a note mark on every tax figure and keep "needs review" and "not checked" states visible in red-ink and ink-3.
- **Do** set every comparable number in tabular numerals, narrowing the width axis as the size grows (75% for the hero figure, 85% for figures, 88% for headlines).
- **Do** keep red for the reader's answer, filled days and current position, and use Press Red for red text under 24px.
- **Do** lay new surfaces on the 12-column grid with 24px gaps and minmax(0, 1fr) tracks.
- **Do** keep transitions to 160 to 220ms with the fast ease-out, and make them instant under reduced motion.
- **Do** group dated lists by day: a big condensed day numeral in a sticky heading, time-only rows beneath, and a 4px ink rule at each month change.
- **Do** let the date be the visual on event surfaces; cards and detail are typographic.
- **Do** put a list's filters in a sticky rail in columns 1 to 3 that collapses to a closed details panel under 900px.
- **Do** write unknown values out in plain words, set in ink-3, with a dashed border when they appear as a tag.
- **Do** draw icons as inline SVG line icons (1.8 stroke, square caps, mitred joins) and disclosure marks in CSS.

### Don't:
- **Don't** round corners; every surface, field and mark is square.
- **Don't** cast shadows on anything in the page flow; only the popover and the toast float. Inset strokes used as rules are fine.
- **Don't** paint colour gradients. A linear-gradient used to draw a solid ink rule is a rule, not a gradient.
- **Don't** wrap content in cards or icon tiles; group with rules. A cost, a summary or an empty state is ruled, not boxed.
- **Don't** put generated illustrations, gradient art or image placeholders on event lists, cards or detail.
- **Don't** use text glyphs (arrows, plus and minus signs) as icons or disclosure marks.
- **Don't** use blue for anything that is not provenance, verification or language access.
- **Don't** add small uppercase lines above headings; uppercase labels name the figure, table or list directly beneath them.
- **Don't** use green anywhere except the calculator's savings line.
