# UI design references

The visual source of truth is [Planner.pen](./Planner.pen), opened in pen.dev.
Use Pen/Pencil MCP to inspect and edit the relevant frames before changing the UI.
Create and maintain mockups in pen.dev only; do not generate raster mockups with
Image Gen or save/commit PNG mockup exports. Keep the `images/` directory alongside
the document; it contains an imported image used by the Pen source.

## September plan

Frame `h9BBT` (`Editable Plan / September`) contains a weekly/monthly plan grid
and a right-side fact inspector.
Controls in the grid represent checkbox, count, scale, and time tracking.

## Goal-creation variants

Frame `elkpw` (`Create Goal / All Variants`) documents the supported combinations
of tracking type and period.
Use the API contract and `src/app/styles/index.css` as the semantic source for
fields and visual tokens.

## Global search

[Search screens and interaction rules](./search/README.md) document the proposed
global search: initial state, results with a preview, expanded filters, and mobile.
The editable screens and reusable components are in the existing `Planner.pen`,
to the right of the earlier layouts. The documentation lists frame IDs for mobile
detail/filter screens and empty, loading, and error states.

## Telegram notifications

`Planner.pen` contains reusable Telegram components and 12 notification scenarios
inside iPhone 17 Pro frames. They cover checkbox, count, scale and time tracking,
the evening digest, postponement, corrections, account connection, reply input
with the iOS keyboard, validation errors, and bot commands.

## Goal progress and scheduled reports

[Progress and Telegram report mockups](./progress/README.md) cover weekly and
monthly statistics, all tracking types, comparisons and streaks, the shared start
date, report settings, empty and error states, and six Telegram message variants.
The same `Planner.pen` contains 53 editable screens and state boards, a navigation
map, and reusable components under «Прогресс». Desktop, 390 px and 320 px frames
are indexed with IDs, reproducible sample data, interaction notes, and coverage
of the specification.

## Developer services and donations

[Developer card and donation mockups](./monetization/README.md) show a compact
services card and support action in the sidebar, a desktop donation dialog,
mobile navigation, and donation sheets at 390 and 320 px. The editable
«Монетизация» frames and reusable components are in the existing `Planner.pen`,
including a custom amount example. Payment and contact links are selected when
implementing the design.
