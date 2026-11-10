// Finds the references to CLAUDE.md and docs/DESIGN_SYSTEM.md that do not resolve.
//
// F11 (docs/ai/STATE.md): a prompt cited CLAUDE.md sections by number, the numbers were wrong,
// and nothing checked them. A number is a position, and positions move when a section is added.
// So the rule here is:
//
//   - CLAUDE.md is referred to by section NAME, written `CLAUDE.md`, *Architecture rules* (or, in
//     CLAUDE.md itself, the *Architecture rules* section). The name must be one of its `## N. Name`
//     headings. A `§N` aimed at CLAUDE.md is refused outright, even when the number exists today.
//   - A rule identifier R1, R2, ... must be one that CLAUDE.md declares (`**R1 — ...**`). These
//     are stable names, not positions.
//   - docs/DESIGN_SYSTEM.md is a team document in Portuguese that numbers its own sections, so a
//     `§N` there or after a mention of it on the same line must be one of its numbered headings.
//     A `§N` that names no document is refused: that ambiguity is how F11 happened.
//
// docs/prompts/ holds task prompts verbatim, as records; they are not references and are skipped,
// and so is this check's own test, whose bad references are its fixtures.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** What is scanned, as git pathspecs. */
const SCANNED = [
  'src',
  'docs',
  'scripts',
  'CLAUDE.md',
  'README.md',
  'eslint.boundaries.js',
  'eslint.config.js',
  '.github',
];
// The prompts are records; this check's own test holds deliberate bad references as fixtures.
const SKIPPED = /^docs\/prompts\/|^scripts\/claude-md-refs\.test\.mjs$/;
const TEXT = /\.(ts|mjs|js|md|json|html|css|yml|yaml)$/;

/** The `## N. Name` headings of CLAUDE.md, as a set of names. */
export function claudeSections(claudeMd) {
  return new Set([...claudeMd.matchAll(/^## \d+\. (.+)$/gm)].map((match) => match[1].trim()));
}

/** The rule identifiers CLAUDE.md declares, as `**R1 — ...`. */
export function claudeRules(claudeMd) {
  return new Set([...claudeMd.matchAll(/^\*\*(R\d+) — /gm)].map((match) => match[1]));
}

/** The numbers of the `##` and `###` headings of DESIGN_SYSTEM.md (`7`, `2.4`). */
export function designSections(designMd) {
  return new Set([...designMd.matchAll(/^#{2,3} (\d+(?:\.\d+)*)\.? /gm)].map((match) => match[1]));
}

const DOC_MENTION = /CLAUDE\.md|DESIGN_SYSTEM\.md/g;

/** The document a `§` at `index` of `line` points to: the nearest one named before it. */
function targetOf(line, index, file) {
  let target = null;
  for (const match of line.matchAll(DOC_MENTION)) {
    if (match.index < index) target = match[0];
  }
  if (target === null && file === 'docs/DESIGN_SYSTEM.md') target = 'DESIGN_SYSTEM.md';
  return target;
}

/**
 * Every unresolved reference in `text`, as `file:line: problem`.
 *
 * @param {string} file path relative to the repository root
 * @param {string} text
 * @param {{ sections: Set<string>, rules: Set<string>, design: Set<string> }} known
 */
export function problemsIn(file, text, known) {
  const problems = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;

    for (const match of line.matchAll(/§\s?(\d+(?:\.\d+)*)/g)) {
      const target = targetOf(line, match.index, file);
      if (target === 'CLAUDE.md') {
        problems.push(`${at}: "${match[0]}" cites CLAUDE.md by number; name the section instead`);
      } else if (target === null) {
        problems.push(`${at}: "${match[0]}" names no document`);
      } else if (!known.design.has(match[1])) {
        problems.push(`${at}: DESIGN_SYSTEM.md has no section ${match[1]}`);
      }
    }

    const named = [
      ...line.matchAll(/CLAUDE\.md`?,? \*([^*]+)\*/g),
      ...line.matchAll(/\*([^*]+)\* section of `?CLAUDE\.md/g),
      ...(file === 'CLAUDE.md' ? line.matchAll(/the \*([^*]+)\* section/g) : []),
    ];
    for (const match of named) {
      if (!known.sections.has(match[1].trim())) {
        problems.push(`${at}: CLAUDE.md has no section named "${match[1]}"`);
      }
    }

    for (const match of line.matchAll(/\bR(\d+)\b/g)) {
      if (!known.rules.has(match[0])) {
        problems.push(`${at}: CLAUDE.md declares no rule ${match[0]}`);
      }
    }
  });
  return problems;
}

/** The sections, rules and design-system numbers that exist, read from the two documents. */
export function knownTargets(root = ROOT) {
  const claudeMd = readFileSync(resolve(root, 'CLAUDE.md'), 'utf8');
  const designMd = readFileSync(resolve(root, 'docs/DESIGN_SYSTEM.md'), 'utf8');
  return {
    sections: claudeSections(claudeMd),
    rules: claudeRules(claudeMd),
    design: designSections(designMd),
  };
}

/** The tracked text files the check reads. */
export function scannedFiles(root = ROOT) {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', ...SCANNED],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter((file) => file !== '' && TEXT.test(file) && !SKIPPED.test(file));
}

/** Every unresolved reference in the repository. */
export function repositoryProblems(root = ROOT) {
  const known = knownTargets(root);
  return scannedFiles(root).flatMap((file) =>
    problemsIn(file, readFileSync(resolve(root, file), 'utf8'), known),
  );
}
