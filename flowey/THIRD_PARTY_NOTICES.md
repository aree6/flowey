# Third-party notices

Archify includes optional vector data for third-party brand marks. These marks
are provided only to identify technologies and services in user-authored
diagrams. Their inclusion does not imply sponsorship, endorsement, partnership,
or affiliation with Archify.

The Archify MIT license applies to Archify's own code and content. It does not
replace the copyright licenses, trademark policies, or brand guidelines that
apply to third-party marks. Users are responsible for confirming that their
particular use is permitted.

## TheSVG registry

Built-in brand marks are vendored SVG artwork retrieved from
[thesvg.org](https://thesvg.org). Each mark's `assets/<id>.svg` file is
committed so a build needs no network, and the generator inlines it as a
base64 `data:image/svg+xml` URL. The generator reads the public registry at
`https://thesvg.org/api/registry.json` when refreshing artwork and records
the upstream slug and license per mark in
`renderers/shared/generated-brand-marks.mjs`.

Because the artwork is inlined rather than traced into a single vector path,
marks can keep the real fills, strokes, and gradients of each logo. Their
appearance therefore no longer depends on an authored monochrome hex, and a
diagram cannot recolour them into the wrong brand.

As with any third-party icon set, a permissive license for the *collection*
does not make every underlying trademark or artwork free to redistribute.
The licenses TheSVG records upstream are carried through verbatim:

| License | Marks |
|---|---|
| CC0-1.0 | 88 |
| MIT | 6 |
| CC-BY-4.0 | 1 |
| CC-BY-SA-3.0 | 1 |
| CC-BY-SA-4.0 | 1 |
| CC-BY-NC-SA-4.0 | 1 |
| Apache-2.0 | 1 |
| brand-use | 1 |

The `CC-BY-NC-SA-4.0`, `CC-BY-SA-*`, and `brand-use` marks carry conditions
that a commercial or redistributed diagram may not satisfy. Check the recorded
`source` and `license` for the specific mark before publishing. Archify
embeds the artwork as delivered; users are responsible for confirming their
particular use is permitted.

The source, license, and registry slug for every packaged mark are preserved
in `renderers/shared/generated-brand-marks.mjs`.

## OpenAI mark

The OpenAI vector path is recorded from the
[OpenAI brand guidelines](https://openai.com/brand/). The registry's own
`openai.svg` is white-on-transparent and therefore invisible on a light
diagram, so the traced path is kept instead.
Use remains subject to those current guidelines and any applicable trademark
rights. Its inclusion does not state or imply endorsement by OpenAI.

## JetBrains Mono

Delivered Archify viewer artifacts embed the JetBrains Mono variable font
subsets served by Google Fonts. For characters covered by these subsets, font
selection does not depend on a network request or a locally installed copy.
Uncovered characters (including CJK) still use the system fallback stack;
browser and operating-system rasterization can differ.
JetBrains Mono is maintained at
[github.com/JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono)
and is distributed under the SIL Open Font License 1.1. The complete license
text is preserved in `assets/JetBrainsMono-OFL.txt` in the packaged Skill and
in the font CSS carried by standalone HTML and SVG exports.

## Phosphor Icons

Node corner stamps beyond the built-in set come from [Phosphor Icons](https://phosphoricons.com/),
vendored unmodified under `icons/phosphor/` (see `icons/PHOSPHOR-LICENSE.txt`).
Phosphor Icons is Copyright (c) 2020-2024 Phosphor Icons and is distributed
under the MIT License. The full license text travels with the vendored files.

## No additional rights granted

Brand names, logos, and trademarks remain the property of their respective
owners. This notice records provenance and known terms; it does not grant rights
that Archify does not hold, and it does not state that every packaged mark has
been cleared for every commercial, promotional, or redistributive use.
