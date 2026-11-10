// No literal visual value outside tokens.css (CLAUDE.md, *The design system is binding*). Scans the component styles and
// templates under src/app — external .css files and the inline `styles`/`template` of .ts files —
// plus sinapse.css, which FE-1 verified the same way.

import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'src/app');

function files(dir, pattern) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (entry) => entry.isFile() && pattern.test(entry.name) && !entry.name.endsWith('.spec.ts'),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

const sources = [...files(app, /\.(css|html|ts)$/), join(root, 'src/styles/sinapse.css')].map(
  (file) => ({
    file: relative(root, file),
    // Comments may name a token in prose; only code counts.
    text: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  }),
);

const tokensCss = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
const tokens = JSON.parse(readFileSync(join(root, 'src/styles/tokens.json'), 'utf8'));

test('no literal colour outside tokens.css', () => {
  const colour = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|lab|lch)\(/i;
  const offenders = sources.filter(({ text }) => colour.test(text)).map(({ file }) => file);
  assert.deepEqual(offenders, []);
});

test('every custom property a component reads is declared in tokens.css', () => {
  const declared = new Set([...tokensCss.matchAll(/--([A-Za-z0-9_\\.-]+):/g)].map((m) => m[1]));
  const missing = [];
  for (const { file, text } of sources) {
    for (const [, name] of text.matchAll(/var\(--([A-Za-z0-9_\\.-]+)\)/g)) {
      if (!declared.has(name)) missing.push(`${file}: --${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every media-query width under src/app is a breakpoint token', () => {
  const breakpoints = new Set(tokens.breakpoint.tokens.map((t) => t.value));
  const stray = [];
  for (const { file, text } of sources.filter(({ file }) => file.startsWith('src/app'))) {
    for (const [, width] of text.matchAll(/\(min-width:\s*(\d+px)\)/g)) {
      if (!breakpoints.has(width)) stray.push(`${file}: ${width}`);
    }
    if (/max-width:\s*\d+px\)/.test(text))
      stray.push(`${file}: max-width query (write narrow to wide)`);
  }
  assert.deepEqual(stray, []);
});

test('the student layout switches at bp-md and bp-lg', () => {
  const css = readFileSync(join(app, 'layouts/student-layout/student-layout.css'), 'utf8');
  const value = (name) => tokens.breakpoint.tokens.find((t) => t.name === name).value;
  assert.match(css, new RegExp(`@media \\(min-width: ${value('bp-md')}\\)`));
  assert.match(css, new RegExp(`@media \\(min-width: ${value('bp-lg')}\\)`));
});

test('nothing under src/app touches browser storage', () => {
  const offenders = sources
    .filter(
      ({ file, text }) =>
        file.startsWith('src/app') && /\b(localStorage|sessionStorage|indexedDB)\b/.test(text),
    )
    .map(({ file }) => file);
  assert.deepEqual(offenders, []);
});
