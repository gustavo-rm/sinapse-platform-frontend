// Every reference to a CLAUDE.md section, a rule R1..R7 or a DESIGN_SYSTEM.md section resolves
// (F11). Run with `npm run test:scripts`, part of `npm test`; see claude-md-refs.mjs for the rule.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { knownTargets, problemsIn, repositoryProblems, scannedFiles } from './claude-md-refs.mjs';

test('every section and rule reference in the repository resolves', () => {
  assert.deepEqual(repositoryProblems(), []);
});

test('the check reads CLAUDE.md, the docs, the sources and the scripts, and skips the verbatim prompts', () => {
  const files = scannedFiles();
  for (const expected of [
    'CLAUDE.md',
    'docs/ai/STATE.md',
    'docs/DESIGN_SYSTEM.md',
    'eslint.boundaries.js',
    'src/app/core/api/api-client.ts',
    'scripts/eslint-boundaries.test.mjs',
  ]) {
    assert.ok(files.includes(expected), `${expected} is not scanned`);
  }
  assert.ok(!files.some((file) => file.startsWith('docs/prompts/')));
  assert.ok(files.includes('scripts/claude-md-refs.mjs'));
});

test('CLAUDE.md declares the sections and the seven rules the references point to', () => {
  const known = knownTargets();
  assert.ok(known.sections.has('Architecture rules'));
  assert.ok(known.sections.has('Definition of done'));
  assert.deepEqual([...known.rules].sort(), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
  assert.ok(known.design.has('7') && known.design.has('2.4'));
});

test('a bad reference fails the check, one problem per bad reference', () => {
  const known = knownTargets();
  const bad = [
    'See `CLAUDE.md` §6 for the boundaries.', // a number aimed at CLAUDE.md, even an existing one
    'See `CLAUDE.md`, *Architecture rulez*.', // a name that is not a heading
    'The *Stak* section of CLAUDE.md pins TypeScript.', // the other form, misspelt
    'Rule R8 forbids it.', // a rule CLAUDE.md does not declare
    'As §3 says.', // a § that names no document
    'In `docs/DESIGN_SYSTEM.md` §99.', // a design-system section that does not exist
  ].join('\n');
  const problems = problemsIn('src/app/example.ts', bad, known);
  assert.equal(problems.length, 6, problems.join('\n'));
  assert.match(problems[0], /cites CLAUDE\.md by number/);
  assert.match(problems[1], /no section named "Architecture rulez"/);
  assert.match(problems[2], /no section named "Stak"/);
  assert.match(problems[3], /declares no rule R8/);
  assert.match(problems[4], /names no document/);
  assert.match(problems[5], /DESIGN_SYSTEM\.md has no section 99/);
});

test('a good reference passes', () => {
  const known = knownTargets();
  const good = [
    'See `CLAUDE.md`, *Architecture rules*, rule R1.',
    'The *Session and time, in one place* section of `CLAUDE.md`.',
    'Per `docs/DESIGN_SYSTEM.md` §7 and §2.4.',
    'R2_SYNTAX is an identifier, not a rule reference.',
  ].join('\n');
  assert.deepEqual(problemsIn('src/app/example.ts', good, known), []);
});
