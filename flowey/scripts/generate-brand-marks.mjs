#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const catalogPath = path.join(root, 'brand-marks', 'catalog.json');
const outputPath = path.join(root, 'renderers', 'shared', 'generated-brand-marks.mjs');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

function normalizedList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item).trim())
    .filter(Boolean))];
}

function lookupForms(value) {
  const raw = String(value ?? '').trim().toLocaleLowerCase('en-US');
  if (!raw) return [];
  return [...new Set([
    raw,
    raw.replace(/[\s_]+/g, '-'),
    raw.replace(/[\s_.-]+/g, ''),
  ])];
}

function fail(message) {
  console.error(`brand catalog: ${message}`);
  process.exit(1);
}

const NAMED = new Map([
  ['black', '#000000'], ['white', '#ffffff'], ['red', '#ff0000'], ['lime', '#00ff00'],
  ['blue', '#0000ff'], ['yellow', '#ffff00'], ['cyan', '#00ffff'], ['aqua', '#00ffff'],
  ['magenta', '#ff00ff'], ['fuchsia', '#ff00ff'], ['gray', '#808080'], ['grey', '#808080'],
  ['silver', '#c0c0c0'], ['maroon', '#800000'], ['olive', '#808000'], ['green', '#008000'],
  ['navy', '#000080'], ['teal', '#008080'], ['purple', '#800080'],
]);

// A vendored mark keeps its real artwork, so a multi-colour logo must stay an
// image. A logo whose ink is a single luminance is the exception: its colour
// carries no information, so it can be inlined with currentColor and let the
// theme decide. That makes a black mark black on a light face and white on a
// dark one, with no plate behind it.
const COLOUR_ATTR = /(fill|stroke|stop-color|flood-color)(\s*[=:]\s*)(["']?)([^;}"'\s]{1,24})\3/gi;

function paintTokens(svg) {
  const values = new Set();
  COLOUR_ATTR.lastIndex = 0;
  let match;
  while ((match = COLOUR_ATTR.exec(svg)) !== null) values.add(match[4].toLowerCase());
  return values;
}

function luminanceOf(value) {
  if (!value || value === 'none' || value === 'transparent' || value.startsWith('url(')
    || value.includes('var(') || value.startsWith('rgb') || value.startsWith('hwb')
    || value.startsWith('currentcolor')) return null;
  let hex = value;
  if (value === 'current-color') hex = '#000000';
  if (NAMED.has(value)) hex = NAMED.get(value);
  if (!/^#[0-9a-f]{3,8}$/.test(hex)) return null;
  // #rgb, #rgba, #rrggbb, #rrggbbaa all collapse to the opaque rgb triple.
  const digits = hex.slice(1);
  const rgb = digits.length <= 4
    ? digits.slice(0, 3).split('').map((d) => d + d)
    : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
  const [r, g, b] = rgb.map((part) => parseInt(part, 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Returns the mark's inner markup with every paint rewritten to currentColor
// when the artwork is single-luminance, or null when it must stay an image.
function monochromeInk(svg) {
  const lumina = [];
  for (const value of paintTokens(svg)) {
    const l = luminanceOf(value);
    if (l !== null) lumina.push(l);
  }
  // Nothing measurable means unresolved paint (currentColor, or no fill at
  // all): SVG defaults to black, so theme it like any other single-ink mark.
  const single = lumina.length === 0
    || lumina.every((l) => l < 48)
    || lumina.every((l) => l > 208);
  if (!single) return null;
  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '');
  return body.replace(COLOUR_ATTR, (whole, prop, sep, quote, value) => {
    if (luminanceOf(value) === null) return whole;
    return `${prop}${sep}${quote}currentColor${quote}`;
  });
}

if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.marks) || catalog.marks.length === 0) {
  fail('catalog.json must contain a non-empty schemaVersion 1 marks array');
}

const ids = new Set();
const lookupKeys = new Map();
const domains = new Map();
const generated = catalog.marks.map((entry, index) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id || '')) fail(`marks[${index}] has an invalid id`);
  if (ids.has(entry.id)) fail(`duplicate id ${entry.id}`);
  ids.add(entry.id);

  const aliases = normalizedList(entry.aliases);
  const entryDomains = normalizedList(entry.domains).map((domain) => domain.toLowerCase());
  for (const key of [entry.id, ...aliases]) {
    for (const form of lookupForms(key)) {
      if (lookupKeys.has(form) && lookupKeys.get(form) !== entry.id) {
        fail(`lookup key ${JSON.stringify(key)} is shared by ${lookupKeys.get(form)} and ${entry.id}`);
      }
      lookupKeys.set(form, entry.id);
    }
  }
  for (const domain of entryDomains) {
    if (domains.has(domain) && domains.get(domain) !== entry.id) {
      fail(`domain ${domain} is shared by ${domains.get(domain)} and ${entry.id}`);
    }
    domains.set(domain, entry.id);
  }

  let mark;
  if (entry.asset) {
    // Real multi-colour artwork vendored from a public icon registry. The file
    // is inlined as a data URL so a delivered artifact keeps the true colours
    // and gradients, with no network access at render or view time.
    const file = String(entry.asset);
    if (!/^[-a-z0-9.]+\.svg$/i.test(file)) fail(`${entry.id} asset must be a plain .svg filename`);
    const assetPath = path.join(root, 'brand-marks', 'assets', file);
    if (!fs.existsSync(assetPath)) fail(`${entry.id} asset ${file} is missing from brand-marks/assets`);
    const svg = fs.readFileSync(assetPath, 'utf8');
    if (/<script|<foreignObject|\son[a-z]+\s*=|xlink:href\s*=\s*["']?\s*https?:/i.test(svg)) {
      fail(`${entry.id} asset ${file} contains scripting, foreign content, or a remote reference`);
    }
    const parsed = /viewBox\s*=\s*["']\s*([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)\s*["']/i.exec(svg);
    const width = Number(entry.viewBox || (parsed && parsed[3]));
    if (!Number.isFinite(width) || width <= 0) fail(`${entry.id} asset ${file} needs a resolvable viewBox`);
    mark = {
      id: entry.id,
      title: entry.title || entry.id,
      category: entry.category,
      aliases,
      domains: entryDomains,
      viewBox: width,
      hex: String(entry.hex || '#000000').replace(/^#/, '').toUpperCase(),
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
      provenance: {
        provider: entry.provider || 'TheSVG',
        source: entry.source,
        ...(entry.guidelines ? { guidelines: entry.guidelines } : {}),
        ...(entry.license ? { license: entry.license } : {}),
      },
    };
    const ink = monochromeInk(svg);
    if (ink) {
      mark.ink = ink;
      mark.mono = true;
      delete mark.dataUrl;
    }
  } else if (entry.custom) {
    const custom = entry.custom;
    if (!entry.title || !custom.path || !custom.source || !/^[0-9A-F]{6}$/i.test(custom.hex || '')) {
      fail(`${entry.id} custom mark requires title, path, source, and six-digit hex`);
    }
    mark = {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      aliases,
      domains: entryDomains,
      viewBox: custom.viewBox || 24,
      hex: custom.hex.toUpperCase(),
      path: custom.path,
      provenance: {
        provider: 'Official brand asset',
        source: custom.source,
        ...(custom.guidelines ? { guidelines: custom.guidelines } : {}),
      },
    };
  } else {
    fail(`${entry.id} must provide asset or custom`);
  }
  if (!mark.category || !mark.title) fail(`${entry.id} is missing category or title`);
  // A hand-authored mark is one brand hex, so the same single-luminance rule
  // applies: black ink is invisible on a dark node face and white ink on a
  // light one, unless the plate carries it.
  if (entry.custom) {
    const hex = mark.hex.replace(/^#/, '');
    const luminance = 0.2126 * parseInt(hex.slice(0, 2), 16)
      + 0.7152 * parseInt(hex.slice(2, 4), 16)
      + 0.0722 * parseInt(hex.slice(4, 6), 16);
    if (luminance < 48 || luminance > 208) mark.mono = true;
  }
  for (const form of lookupForms(mark.title)) {
    if (lookupKeys.has(form) && lookupKeys.get(form) !== entry.id) {
      fail(`title ${JSON.stringify(mark.title)} is shared by ${lookupKeys.get(form)} and ${entry.id}`);
    }
    lookupKeys.set(form, entry.id);
  }
  return mark;
}).sort((left, right) => left.id.localeCompare(right.id));

const banner = `// Generated by scripts/generate-brand-marks.mjs from brand-marks/catalog.json.\n// Vector marks are vendored artwork from TheSVG (https://thesvg.org); hand-authored
// marks record their own source. Do not edit by hand.\n`;
const source = `${banner}export const BRAND_MARKS = Object.freeze(${JSON.stringify(generated, null, 2)});\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, 'utf8').replace(/\r\n?/g, '\n')
    : '';
  if (current !== source) {
    console.error('generated brand marks are stale — run npm run generate:brand-marks');
    process.exit(1);
  }
} else {
  const temporary = `${outputPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, source);
  fs.renameSync(temporary, outputPath);
  console.log(`generated ${path.relative(root, outputPath)} (${generated.length} marks)`);
}
