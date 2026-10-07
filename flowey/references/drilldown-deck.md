# Drill-down deck pattern

A complicated subject ships as a linked deck, not one crowded page. The
canonical shape is four pages (see `examples/food-*.architecture.json` and
`examples/food-deck.links.json`):

1. **Simple overview** (`food-overview`): at most 7 nodes, one per subsystem.
   No detail inside. One `outcome` nav node (`full-map`) opens the unified view.
2. **One detail page per subsystem group** (`food-order-detail`,
   `food-dispatch-detail`): the decomposed flows. Every node links back to
   the overview so presenting never strands the reader.
3. **Unified view** (`food-unified`): everything on one page for the reader
   who wants the whole system. Its nodes link sideways into the detail page
   that owns them.

## Wiring contract

- `finalize` every page first. Then apply `flowey links` last with relative
  sibling paths, one map per page, exactly as recorded in
  `examples/food-deck.links.json`:
  - overview subsystem node → its detail page; overview `full-map` → unified.
  - every detail node → overview.
  - every unified node → the detail page that owns it.
- Keep every map id an existing node id in its page, and every map target a
  shipped `.html` filename whose source JSON has the same `meta.output`.
  `test/drilldown-deck.test.mjs` enforces this manifest mechanically.
- Post-delivery rules apply: strict `check` on a wired page reports a
  provenance mismatch by design (verify by opening and clicking through);
  re-delivery wipes the links layer, so re-apply links after any re-delivery.

## Authoring rules that make decks work

- Content starts near the top of the canvas (first row around y=80). Never
  copy the old y=240 placement: empty canvas above the content reads as a
  broken fit. With no boundaries or phases, nothing needs the top reserve.
- Every node sets an `icon` from `flowey icons <single-word>` (never guessed).
- Keep the overview to one row of subsystems plus one row of shared
  dependencies; detail pages stay under 6 nodes each.
- Decks set `meta.animation: "trace"` so edges play the ambient pulse and
  hover/focus traces travel every connected edge infinitely. For presenting,
  apply `flowey motion` after `links` so hover traces loop at presentation
  pacing instead of playing once.
