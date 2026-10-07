---
name: flowey
description: "Create polished, validated hierarchy, architecture, workflow, sequence, data-flow, and lifecycle/state diagrams as explorable standalone HTML with inline SVG, dark/light themes, optional trace motion, and PNG/JPEG/WebP/SVG/WebM export. Accept plain-language requirements or pasted Mermaid flowchart, sequenceDiagram, and stateDiagram input; record subject-neutral citations (notes, URLs, PDFs, people, documents) when facts come from outside the request. Use when the user asks to visualize anything with people, steps, parts, relationships, or states: an org chart or reporting line, a leave or travel plan, an application or approval process, a back-and-forth exchange, where money or documents go, where something stands, or to convert/beautify Mermaid — for everyday subjects and codebases alike. Not for numeric charts or dashboards."
license: MIT
metadata:
  version: "1.0"
  author: flowey
  based_on: tt-a1i/archify (MIT, v3.0.1)
---

# Flowey

Create an interactive HTML diagram from typed JSON. Static output is the default; enable motion only when requested.

Run commands from your working directory. Unless the user names another location, give each new diagram request its own folder `.flowey/<type>-<slug>-<YYYYMMDD-HHMMSS>/` there (local time, chosen once when the request starts): keep `candidate.json` and `<slug>.html` in it, set `meta.output` to that relative HTML path, and reuse the folder for every repair rerun. The CLI `<output.html>` argument and `meta.output` must be the same relative path. A later request gets a new folder, so earlier versions stay intact. Replace `bin/flowey.mjs` in the commands below with the installed package's absolute path, or its path relative to your working directory; input and output paths resolve from that working directory.

For facts that come from outside the request, read [Citations authoring](references/citations-authoring.md) while gathering sources. A plain description uses the steps below; an existing JSON uses the handoff path.

## Existing candidate handoff

When the user supplies a frozen candidate, run `finalize` first as one CLI invocation. Its passing receipt completes the automated gates; follow any visual review recommendation under Delivery before claiming visual quality. For repair, follow step 5.

`finalize` includes a bounded update check in its delivery receipt; see Update awareness.

## Fast authoring path

Use this path for ordinary generation. Read branch references only when their stated trigger applies.

1. Choose `hierarchy`, `architecture`, `workflow`, `sequence`, `dataflow`, or `lifecycle` from the question.
2. Use the exact schema and example paths in the Type router. Read [Authoring defaults](references/authoring-defaults.md) and the mode's example in a bounded batch (at most 3 files per message), separate from project documents and complete schemas so neither is truncated; recover any missing section before writing. For Architecture, use the matching showcase example. For Sequence, Dataflow, Lifecycle, and Hierarchy, also read the mode and common schemas. Read the relevant schema definition before choosing any new field, enum, or constrained text, especially boundary kinds and node types. Examples teach shape, not facts. Use fresh IDs, wording, and layout. Run `doctor` once when setting up a new environment; otherwise go directly to the candidate without preliminary help, starter validation, temporary diagrams, or output-path listing. Query brands only for an explicitly requested mark; read [Brand marks](references/brand-marks.md) for an unknown mark with a user-provided URL.
3. Once the requested scope and [citations](references/citations-authoring.md) are covered, decide the page count before writing: one overview page plus one detail page per part worth clicking into (a frontend, backend, database, phase, or subsystem — see the drill-down rule in Post-delivery stages). A single page suffices only when nothing merits its own view. Then write each complete candidate directly without planning coordinates in prose. Size nodes to their labels up front: a default workflow node fits ~92px, so set explicit `width` on any node whose label is longer instead of discovering it through validation. Pick a corner `icon` per node via `node bin/flowey.mjs icons <words>` (never guess a glyph name; omit `icon` when the search has no good match). Keep one node's out-degree to about three or four; beyond that, group outflows through an intermediate node. Choose Architecture abstraction and connected placement using Authoring defaults before coordinates: show the main user journey and necessary branches, preserve control roles and behavior-changing conditions, and leave enough room for actual relationship labels. No node, relationship, citation, view, card, or boundary count is a target or ceiling. Keep the source JSON free of duplicate keys: the parser keeps the last value silently and the gates will not flag it. Cards answer extra reader questions but must not introduce new facts; citations live on nodes only. Use automatic routes first; add explicit routing only for necessary branch, return, supplied geometry, or measured repair. Set `meta.quality_profile` to `"showcase"` unless the user requests dense `standard`.
4. Once the complete first candidate is written, run `finalize` directly (once per page when step 3 planned several). Its first gate is showcase validation; successful first drafts need no separate pre-validation. Keep the candidate unchanged while the command runs:

   ```bash
   node bin/flowey.mjs finalize <type> <candidate.json> <output.html> --quality showcase --json
   ```

   A passing receipt proves the included `validate`, `deliver`, strict `check`, and real-browser `browser-check` gates passed. Use its compact summary; run standalone commands only for a separate request or focused failure diagnosis.

5. A non-zero exit is never success. Read compact stdout or `evidence.summaryReceipt`, then [repair the failed gate](references/delivery-contract.md#failed-finalize-and-candidate-repair), including its repair limit. One repair round is one batch of connected edits plus one `finalize` rerun: fixing several labels flagged by the same receipt in one batch still counts as one round. Preserve requested meaning and citations. For several tangled Architecture routes, read [Architecture layout repair](references/architecture-layout-repair.md); for measured field or geometry failures, read [Authoring contract](references/authoring-contract.md). Edit the connected neighborhood and rerun the complete `finalize` command from step 4. Apply at most two repair rounds. If the second still fails, report the receipt honestly instead of a third guess.

## Update awareness

`finalize` and standalone `deliver` include `update` in their receipts. Do not run a separate check for the same delivery. If `update.noticeRequired` is true, read `references/update-awareness.md` and keep one update line in your final response to the user, even after a quality gate fails. For a task with several diagrams, mention the update once in the final response. Snooze or ignore a reminder only when the user explicitly asks; never install or update on your own initiative.

Before the first candidate, use the authoring references and relevant sources, not Flowey implementation or tests. Inspect Flowey implementation if diagnostics remain unactionable after focused repairs.

## Type router

| Type | Use for | Schema | Example |
|---|---|---|---|
| `hierarchy` | Org charts, reporting lines, dotted-line advisory relationships; who reports to whom | `schemas/hierarchy.schema.json` | `examples/org-chart.hierarchy.json` |
| `architecture` | Parts and boundaries of anything: a campus office, a codebase, a service map; what something is made of | `schemas/architecture.schema.json` | Everyday: `examples/leave-approval.architecture.json`; codebases: `examples/web-app.architecture.json` |
| `workflow` | Processes, approvals, runbooks; plans and step-by-step everyday or operational flows | `schemas/workflow.schema.json` | Everyday: `examples/leave-approval.workflow.json`; operations: `examples/incident-response.workflow.json` |
| `sequence` | Back-and-forth exchanges over time: people, offices, services; who contacts whom, in what order | `schemas/sequence.schema.json` | Everyday: `examples/clinic-visit.sequence.json`; services: `examples/cache-miss-request.sequence.json` |
| `dataflow` | Where money, documents, or data go: stages, stores, consumers; lineage and handoffs | `schemas/dataflow.schema.json` | Everyday: `examples/scholarship-disbursement.dataflow.json`; analytics: `examples/product-analytics.dataflow.json` |
| `lifecycle` | State/status transitions, waits, retries, terminal states; where an application or order stands | `schemas/lifecycle.schema.json` | Everyday: `examples/visa-application.lifecycle.json` (schema v1); releases: `examples/deployment-release.lifecycle.json` (schema v2) |

A lifecycle diagram keeps a `main` lane first and a `terminal` lane last, with any other populated lanes between them in `lanes[]` order. A hierarchy parent stays readable with about six leaves at default widths; beyond that, narrow roles or split the chart (see [Mode placement](references/authoring-contract.md#mode-placement)).

When ambiguous, run `node bin/flowey.mjs guide "<scenario>" --json`. Scenario proof examples are structural references, not facts to copy.

Node types (`actor`, `action`, `decision`, `milestone`, `place`, `document`, `record`, `outcome`, `group`, `external`) are subject-neutral colors: pick the kind that reads honestly, then name it for the reader with everyday `icon` values and `meta.legend` labels as in [Node icons](references/authoring-contract.md#node-icons). Ask for missing personal facts instead of inventing dates, amounts, names, or rules.

## Mermaid input

Read Mermaid for topology and meaning, then author fresh Flowey JSON; do not mechanically render Mermaid styling.

- `flowchart` / `graph` → `workflow`; a component map → `architecture`; a strict tree → `hierarchy`.
- `sequenceDiagram` → `sequence`; participants become semantic participants and arrows become messages.
- `stateDiagram` → `lifecycle`; states and transitions retain meaning, not Mermaid style.

## Delivery

Use the `finalize` command above for the first candidate and after a repair.

`finalize` stops at the first non-passing gate. Its compact stdout and `<output-stem>.finalize-summary.json` are ordinary evidence; the summary sidecar carries that same compact selection, so when stdout reports `diagnosticSummary.truncated: true`, read the complete diagnostics list in the `<output-stem>.finalize.json` full receipt. A passing run creates no screenshots and reports `visualReview: "not-requested"`.

When a passing Architecture receipt reports `visualReviewRecommendation.signals.resolvedCrossovers`, copy the candidate aside and apply the hints in one edit that changes only node positions and sizes: every node, relationship (including its `from` and `to`), label, and citation stays as it was. Rerun the complete `finalize` once with `--out-dir <folder>/review-2`, because the previous HTML already owns its browser evidence. If that run fails or reports more crossings, restore the copy and finalize it with `--out-dir <folder>/review-3`. Do not start a second placement round. Hints about extra bends alone are optional.

When `layoutReviewRecommendation.action` is `inspect-sequence-width`, follow [Sequence width review](references/delivery-contract.md#sequence-width-review) before handing off a newly authored Sequence.

Perceptual review is optional for ordinary generation, including a newly positioned Architecture. Use [Optional capture evidence](references/delivery-contract.md#optional-capture-evidence), with `--out-dir <folder>/visual-check`, when the user requests visual review, during development audits, or for a concrete route/browser concern. `visualReviewRecommendation` is advisory. Inspect captures before claiming visual quality; otherwise report automated checks only.

Read [Delivery contract](references/delivery-contract.md) for failed gates, standalone commands, provenance/recovery, repeated delivery, exports, or opening. Recovery follows `deliver` → strict provenance `check` → `browser-check`; captures require strict provenance.

For workflow viewport overflow, read [Workflow viewport repair](references/authoring-contract.md#workflow-viewport-repair) before the next layout edit.

Report artifact checks, browser evidence, captures, and actual perceptual review as distinct results. For an explicitly requested immediate preview or active desktop loop, see [Optional opening](references/delivery-contract.md#optional-opening).

## Post-delivery stages

After `finalize` passes, two optional stages augment the delivered HTML in place. Both are deterministic (same input bytes give same output bytes) and refuse to double-wrap; report their output SHA separately since the delivery receipt covers the pre-stage bytes.

- Infinite motion for presentations: `node bin/flowey.mjs motion <output.html> [--json]`. Loops hover-trace animations and SMIL tokens at ~1.5x slower pacing. Ask before using it on an everyday handoff; prefer static output unless the user is presenting.
- Clickable nodes: `node bin/flowey.mjs links <output.html> --map <links.json> [--json]`, where the map is `{ "<node-id>": "<url-or-relative-path>" }`. Every mapped id must exist as `id="node-<id>"` in the artifact. Clicking (or Enter/Space on a focused node) opens the target in a new tab. Use for deck navigation (slide N links to slide N+1's detail page) or docs cross-linking.
- Drill-down decks: for a complicated subject, author one overview diagram first, then one detail diagram per node worth decomposing (see `examples/shop-overview.architecture.json` + `examples/shop-frontend.architecture.json`). `finalize` every page, then apply `links` last with relative sibling paths (e.g. `{"storefront": "shop-frontend.html"}`), plus back-links from each detail page to the overview so presenting never strands the reader. Links is a post-delivery stage like motion: the delivery receipt covers the pre-stage bytes, so strict `check` on a wired page reports a provenance mismatch by design — verify the wired pages by opening them and clicking through instead. A headless click check uses the repo CDP helper (`ChromeVisualBrowser` from `bin/visual-check.mjs`, needs `FLOWEY_CHROME`): navigate to the page, stub `window.open` to record calls, dispatch `click` (plus `keydown` Enter/Space) on `#node-<id>`, and assert the recorded `[url, "_blank", "noopener"]` tuples — see `test/drilldown-links-browser.test.mjs` for the full 20-line pattern. Re-running `deliver`/`finalize` on a page wipes its links layer, so re-apply links after any re-delivery.
- Node icons: `node bin/flowey.mjs icons <words> [--emit] [--limit <n>] [--json]` searches the 50 vendored Phosphor glyphs (MIT, offline, in `icons/`). Set node `icon` to the chosen name (e.g. `"icon": "database"`); it renders as a tone-colored corner stamp beside the type default. `icon: "none"` hides the stamp. Colored company/product marks stay on `brand` via `flowey brands`.

## Optional viewer capabilities

`meta.animation: "trace"` is opt-in.

Read `references/viewer-runtime.md` only when the user explicitly asks for Share Cards, Route/Reach cards, motion, deep links, presentation, search/focus, or another Viewer Runtime feature.

## Setup and fallback

No install is required inside the skill package. Run this setup diagnosis once for a new environment (not before every candidate):

```bash
node bin/flowey.mjs doctor
node bin/flowey.mjs demo <output-directory>
```

When shell access is unavailable, hand-place architecture SVG into `assets/template.html`, use CSS semantic classes rather than inline colors, and follow the visual review contract in `references/delivery-contract.md`.

## Output

Return the checked HTML as an absolute path, diagram type, validation summary, specification/artifact receipt, browser-evidence status, and truthful visual-review status. Do not claim success for a non-zero command or claim visual inspection you did not perform.
