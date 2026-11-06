#!/usr/bin/env node
// Regenerates src/styles/tokens.css from src/styles/tokens.json.
//
//   node scripts/generate-tokens.mjs           write tokens.css
//   node scripts/generate-tokens.mjs --check   exit 1 if the committed tokens.css differs
//
// tokens.json is the only source. tokens.css is never edited by hand: a new value is a token in
// tokens.json, regenerated down. The output reproduces the layout of the committed file:
//
//   1. the first theme on `:root, [data-theme="<first>"]`
//   2. every other theme on `[data-theme="<id>"]`
//   3. the dark theme again under `@media (prefers-color-scheme: dark)`, guarded by
//      `:root:not([data-theme="<first>"])`, so the operating-system preference applies and an
//      explicit choice wins in both directions
//   4. one `:root` block for the unthemed families (spacing, radius, size, breakpoint, z, in the
//      order tokens.json declares them) followed by the font families
//   5. one class per type style
//
// An alias of the form `{token}` becomes `var(--token)`. No dependency beyond Node itself.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TOKENS_JSON = resolve(root, 'src/styles/tokens.json');
export const TOKENS_CSS = resolve(root, 'src/styles/tokens.css');

const HEADER_NOTE =
  '/* Não edite à mão. A fonte é o Design System do SINAPSE; regenere a partir de tokens.json. */';

/** Families that are not plain `{ tokens: [...] }` lists of custom properties. */
const SPECIAL_FAMILIES = new Set(['name', 'version', 'color', 'type']);

/** Escapes a token name for use as a custom-property identifier (`space-0.5` → `space-0\.5`). */
function ident(name) {
  return name.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`);
}

/** Resolves a value: an alias `{token}` becomes `var(--token)`; anything else is kept as is. */
function cssValue(value) {
  const alias = /^\{([A-Za-z0-9][A-Za-z0-9_.-]*)\}$/.exec(value);
  return alias ? `var(--${ident(alias[1])})` : String(value);
}

/**
 * Value of a token in a theme. A plain value applies to every theme; a theme missing from a
 * per-theme object inherits the first theme's value (the Design System artifact's rule).
 */
function themedValue(token, themeId, firstThemeId) {
  const { value } = token;
  if (value !== null && typeof value === 'object') {
    return cssValue(value[themeId] ?? value[firstThemeId]);
  }
  return cssValue(value);
}

function isThemed(token) {
  return token.value !== null && typeof token.value === 'object';
}

function declarations(tokens, valueOf, indent) {
  return tokens.map((token) => `${indent}--${ident(token.name)}: ${valueOf(token)};`).join('\n');
}

/**
 * Builds the full text of tokens.css from the parsed tokens.json.
 *
 * @param {Record<string, any>} source parsed tokens.json
 * @returns {string} the stylesheet, ending in a newline
 */
export function generateTokensCss(source) {
  const themes = source.color.themes;
  const first = themes[0].id;

  const otherFamilies = Object.keys(source).filter((key) => !SPECIAL_FAMILIES.has(key));
  const themedTokens = [...source.color.tokens];
  const rootTokens = [];
  for (const family of otherFamilies) {
    for (const token of source[family].tokens ?? []) {
      (isThemed(token) ? themedTokens : rootTokens).push(token);
    }
  }

  const blocks = [];
  blocks.push(`/* ${source.name} — generated from tokens.json */\n${HEADER_NOTE}`);

  for (const [index, theme] of themes.entries()) {
    const selector =
      index === 0 ? `:root, [data-theme="${theme.id}"]` : `[data-theme="${theme.id}"]`;
    const body = declarations(themedTokens, (t) => themedValue(t, theme.id, first), '  ');
    blocks.push(`${selector} {\n${body}\n}`);
  }

  const dark = themes.find((theme) => theme.id === 'dark');
  if (dark && dark.id !== first) {
    const body = declarations(themedTokens, (t) => themedValue(t, dark.id, first), '    ');
    blocks.push(
      `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="${first}"]) {\n${body}\n  }\n}`,
    );
  }

  const families = Object.entries(source.type.families).map(
    ([family, stack]) => `  --font-${ident(family)}: ${stack};`,
  );
  const rootBody = [declarations(rootTokens, (t) => cssValue(t.value), '  '), ...families]
    .filter((part) => part.length > 0)
    .join('\n');
  blocks.push(`:root {\n${rootBody}\n}`);

  const styles = [];
  for (const group of source.type.groups) {
    for (const style of group.styles) {
      const lines = [
        `  font-family: var(--font-${ident(style.family ?? group.family)});`,
        `  font-size: ${style.fontSize};`,
        `  line-height: ${style.lineHeight};`,
        `  font-weight: ${style.fontWeight};`,
      ];
      if (style.letterSpacing !== undefined) {
        lines.push(`  letter-spacing: ${style.letterSpacing};`);
      }
      styles.push(`.${ident(style.name)} {\n${lines.join('\n')}\n}`);
    }
  }
  blocks.push(styles.join('\n'));

  return `${blocks.join('\n\n')}\n`;
}

/** Reads tokens.json from disk and returns the stylesheet it generates. */
export function regenerate() {
  return generateTokensCss(JSON.parse(readFileSync(TOKENS_JSON, 'utf8')));
}

function main(argv) {
  const expected = regenerate();
  if (argv.includes('--check')) {
    const committed = readFileSync(TOKENS_CSS, 'utf8');
    if (committed !== expected) {
      console.error(
        'src/styles/tokens.css differs from a regeneration of src/styles/tokens.json.\n' +
          'tokens.css is generated: change tokens.json and run `npm run tokens`.',
      );
      return 1;
    }
    console.log('src/styles/tokens.css matches src/styles/tokens.json.');
    return 0;
  }
  writeFileSync(TOKENS_CSS, expected);
  console.log('src/styles/tokens.css regenerated from src/styles/tokens.json.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
