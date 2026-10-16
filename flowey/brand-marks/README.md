# Built-in brand marks

Flowey ships a bounded catalogue of 107 commonly used brands for architecture,
workflow, sequence, data-flow, and lifecycle nodes. The mark is optional authored
identity: it never replaces the node's semantic `type`, color, label, or
relationships.

Unknown sites are handled by an explicit two-stage workflow. Run
`node bin/flowey.mjs brands capture <url> --json`, then author the returned
digest-pinned `brand` value. Normal render and validate commands do not perform
an unpinned capture, and changed or unavailable content fails closed.

Every mark is vendored vector artwork from the TheSVG registry
(https://thesvg.org), retrieved from `https://thesvg.org/icons/<slug>/default.svg`
and committed under `assets/` so a build never depends on the network. The
OpenAI entry is hand-traced to its official brand guidelines; its vendored
`openai.svg` is white-on-transparent and therefore not usable as a mark, so the
traced path stays. Each generated entry records its source and, when available
upstream, its license metadata in `renderers/shared/generated-brand-marks.mjs`.

Brand names and logos may be trademarks of their respective owners. Simple
Icons' CC0 license covers its collection work, not every underlying trademark or
artwork. Contributors must review the recorded source, current brand guidelines,
and intended referential use before adding or updating a mark. Flowey does not
imply sponsorship, endorsement, or partnership.

A mark may be supplied either as hand-authored `path` data in one brand hex,
or - which every catalog entry apart from OpenAI now uses - as an `asset`, a
vendored SVG that preserves the artwork's real fills, strokes, and gradients:

```json
{ "id": "postgresql", "title": "PostgreSQL", "category": "data",
  "asset": "postgresql.svg", "hex": "336791", "viewBox": 432.071,
  "provider": "TheSVG", "source": "https://thesvg.org/icons/postgresql/default.svg" }
```

The generator inlines the file as a base64 `data:image/svg+xml` URL and the
renderer emits it as an `<image>`, so the delivered artifact keeps the mark's
true colours with no network access at render or view time. `viewBox` is
required when the file does not declare one of its own. Entries are rejected if
the file contains scripting, `foreignObject`, inline event handlers, or a remote
`xlink:href`.

Adding one is three steps: vendor the SVG into `assets/`, add the catalog entry,
regenerate. The public thesvg.org registry is the upstream:

```bash
curl -s https://thesvg.org/api/registry.json | jq '.icons[] | select(.slug|test("postgres"))'
curl -s -o assets/postgresql.svg https://thesvg.org/icons/postgresql/default.svg
```

Then regenerate the committed zero-runtime-dependency bundle:

```bash
npm run generate:brand-marks
npm run check:brand-marks
```

Verify the whole thing renders before trusting it:

```bash
node bin/flowey.mjs render architecture <candidate.json> /tmp/marks.html
grep -c 'data:image/svg+xml;base64' /tmp/marks.html
```

Do not hand-edit `renderers/shared/generated-brand-marks.mjs`.
