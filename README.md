# Flowey

Flowey turns a plain-language description — of anything with people, steps,
parts, relationships, or states — into a polished, interactive diagram as a
single self-contained HTML file. No server, no CDN, no build step: open the
file in any browser, offline.

Forked from [tt-a1i/archify](https://github.com/tt-a1i/archify) (MIT) and
re-scoped from software systems to everyday subjects. The rendering engine,
viewer runtime, delivery pipeline, and quality gates are retained; the
vocabulary, examples, and skill are generalized.

## Diagram types

| Type | Use for |
|---|---|
| `hierarchy` | Org charts, reporting lines, dotted-line advisory relationships |
| `architecture` | Parts and boundaries of anything (an office, a codebase, a service map) |
| `workflow` | Processes, approvals, runbooks, step-by-step flows |
| `sequence` | Back-and-forth exchanges over time (people, offices, services) |
| `dataflow` | Where money, documents, or data go |
| `lifecycle` | State and status transitions, waits, terminal outcomes |

Node kinds are subject-neutral: `actor`, `action`, `decision`, `milestone`,
`place`, `document`, `record`, `outcome`, `group`, `external`.

## Quickstart

```bash
node flowey/bin/flowey.mjs doctor
node flowey/bin/flowey.mjs render hierarchy flowey/examples/org-chart.hierarchy.json /tmp/org.html
node flowey/bin/flowey.mjs finalize workflow flowey/examples/leave-approval.workflow.json /tmp/leave.html --quality showcase --json
```

`finalize` runs the full gate chain (`validate` → `deliver` → strict `check`
→ real-browser `browser-check`) and stops at the first failing gate. A
non-zero exit is never success: read the receipt diagnostics, apply only
their `supportedFixes`, and retry at most twice.

Two optional post-delivery stages augment a delivered artifact in place:

```bash
node flowey/bin/flowey.mjs motion <output.html> [--json]
node flowey/bin/flowey.mjs links <output.html> --map <links.json> [--json]
```

For an active desktop authoring loop, `preview` watches one file over
loopback (`bin/flowey.mjs preview workflow`, `--no-open`, serves
`127.0.0.1`, stops with Ctrl-C).

## Agent skill

The `flowey/` directory is an agent skill: point an agent at
`flowey/SKILL.md` and describe what to visualize in plain language (or paste
Mermaid for topology). Works with Cursor, Codex, Claude, and OpenCode —
any agent that can read a SKILL.md file and run Node commands. The skill
picks a type, authors the typed JSON, finalizes it, and repairs from
receipts. See `flowey/references/` for the progressive-disclosure
authoring, delivery, and viewer contracts.

## Scope and license

Flowey maps structure (people, steps, exchanges, flows, states). Numeric
charts and dashboards are out of scope. MIT licensed (see
`flowey/LICENSE`); third-party notices in `flowey/THIRD_PARTY_NOTICES.md`.
Diagrams bundle JetBrains Mono (SIL OFL 1.1) subsets.
