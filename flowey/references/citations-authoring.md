# Citing sources while authoring

Use this reference when facts in the diagram come from anywhere other than
the requester's own words. The source is the authority for
responsibilities, calls, boundaries, and numbers. The diagram is complete
when the requested meaning is covered and every asserted fact has a
supporting citation.

Flowey citations are never verified against external systems. They record
where the facts came from so readers can judge provenance themselves.

## What counts as a citation

A citation is one object with a required `label` and optional `detail`
and `ref`:

- **Your own notes** — `{ "label": "Author notes", "detail": "interview with the registrar office" }`.
- **A URL** — `{ "label": "Leave policy", "ref": "https://example.edu/leave-policy" }`.
- **A PDF or document page** — `{ "label": "Faculty handbook", "detail": "p. 4, section 2" }`.
- **A person** — `{ "label": "Dr. S. Lim", "detail": "Deputy Dean (Academic), confirmed 2026-09-30" }`.
- **A system or dataset** — `{ "label": "Brio timesheets", "detail": "September 2026 extract" }`.

Keep to 1–3 citations per node: the ones a skeptic would actually check.
Put background material in cards, not in citations.

## Explore on demand

1. **Collect before drawing.** Gather the notes, links, documents, or people
   behind the request before writing the candidate. For a real codebase,
   this means reading entry points, call sites, configuration, and
   manifests; for an everyday subject, it means the policy PDF, the form,
   or the person who owns the process. Record just enough to cite each
   node: a label plus one line of detail or one URL.
2. **Map the slice.** Read a small connected slice instead of scanning
   everything for a convenient label. Follow the requested responsibility
   to its actual input, output, or side effect, whether that is a function
   call or a dean's signature.
3. **Trace ownership.** Derive relationships from the observed actor,
   operation, and target. Distinguish the person requesting an operation
   from the person executing it and the record receiving the result. A
   responsibility statement such as "maintains tasks" does not prove
   direct action; keep the facts with their citations while reading.
4. **Name uncertainty.** Write unresolved questions beside the claim they
   affect. Resolve a question by checking the next relevant source, or
   preserve it as an explicit unknown. Never turn a label, description, or
   config value into an unobserved person or behavior.

Stop exploring when every requested responsibility, relationship, and
boundary has supporting citations and the remaining unknowns cannot change
that coverage. There is no node, edge, citation, view, card, or boundary
count to hit.

## Author from sources

Use the mode's complete JSON shape. Every node whose facts came from
outside the request carries `citations`; boundaries and cards are added
only when they answer a real reader question. Let automatic routes and
automatic viewBox sizing work first. Keep the primary path readable and
leave enough room for actual relationship labels.

An existing example teaches field shape, not facts or arbitrary values. It
does not authorize a new boundary kind, a long note, a viewBox size, or a
route control. Consult the specific mode schema and
`schemas/common.schema.json` whether or not the selected example already
contains the field. Architecture boundaries use `kind: "region"` or `kind:
"scope"`; citations use `label` plus optional `detail` and `ref`.

Ask for missing personal facts instead of inventing dates, amounts, names,
or rules. A guessed citation is worse than none: mark the unknown
explicitly and keep the node uncited.
