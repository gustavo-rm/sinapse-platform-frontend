// Keeps src/styles/tokens.css in step with src/styles/tokens.json. Run with `npm run test:scripts`
// (part of `npm test`). A failure here means tokens.css was edited by hand, or tokens.json changed
// without `npm run tokens`.

import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { TOKENS_CSS, TOKENS_JSON, generateTokensCss, regenerate } from './generate-tokens.mjs';

test('the committed tokens.css is exactly a regeneration of tokens.json', () => {
  assert.equal(readFileSync(TOKENS_CSS, 'utf8'), regenerate());
});

test('a value that is not in tokens.json makes the comparison fail', () => {
  const committed = readFileSync(TOKENS_CSS, 'utf8');
  const handEdited = committed.replace('--primary: #413ba8;', '--primary: #000000;');
  assert.notEqual(handEdited, committed, 'the fixture edit must change the file');
  assert.notEqual(handEdited, regenerate());
});

test('an alias becomes a var() reference in every theme', () => {
  const css = generateTokensCss(JSON.parse(readFileSync(TOKENS_JSON, 'utf8')));
  const occurrences = css.split('--focus-ring: var(--primary);').length - 1;
  assert.equal(occurrences, 3, 'light, dark and the prefers-color-scheme block');
});

test('the dark theme is repeated under the operating-system preference, guarded by the light one', () => {
  const css = regenerate();
  assert.match(
    css,
    /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="light"\]\) \{/,
  );
});
