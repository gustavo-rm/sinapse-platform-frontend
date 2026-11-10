// The boundaries of CLAUDE.md, *Architecture rules* must be seen to fail. Each case lints a deliberate violation as
// if it lived at `file`, through the project's real ESLint configuration, and expects the rule id
// in the message; each legitimate import next to it must pass. Nothing is written to disk.

import { strict as assert } from 'node:assert';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: root });

/** Messages of the boundary rules for `code` placed at `file`. */
async function boundaryMessages(file, code) {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, file) });
  return result.messages
    .filter((m) => /^no-restricted-(imports|syntax|globals)$/.test(m.ruleId ?? ''))
    .map((m) => ({ line: m.line, text: m.message }));
}

const CASES = [
  {
    name: 'R1: HttpClient imported outside core/api/**',
    file: 'src/app/features/today/data/violation.ts',
    code: "import { HttpClient } from '@angular/common/http';\nexport const c = HttpClient;\n",
    rule: 'R1',
    lines: [1],
  },
  {
    name: 'R1: fetch called outside core/api/**',
    file: 'src/app/layouts/violation.ts',
    code: "export const load = () => fetch('state');\n",
    rule: 'R1',
    lines: [1],
  },
  {
    name: 'R2: the literal /api/ outside core/api/api-routes.ts',
    file: 'src/app/core/api/violation.ts',
    code: "export const a = '/api/v1/me/state';\nexport const b = `/api/v1/goals`;\n",
    rule: 'R2',
    lines: [1, 2],
  },
  {
    name: 'R2: an absolute URL',
    file: 'src/app/features/plan/data/violation.ts',
    code: "export const base = 'https://example.org/v1';\n",
    rule: 'R2',
    lines: [1],
  },
  {
    name: 'R3: a feature importing another feature, by either relative path',
    file: 'src/app/features/today/pages/violation.ts',
    code: [
      "import { PLAN_ROUTES } from '../../plan/pages/plan.routes';",
      "import { AgendaPage } from '../../../features/agenda/pages/agenda-page';",
      "import { TodayPage } from './today-page';",
      'export const all = [PLAN_ROUTES, AgendaPage, TodayPage];',
      '',
    ].join('\n'),
    rule: 'R3',
    lines: [1, 2],
  },
  {
    name: 'R3: shared/** importing features/**',
    file: 'src/app/shared/pipes/violation.ts',
    code: "import { TODAY_ROUTES } from '../../features/today/pages/today.routes';\nexport const r = TODAY_ROUTES;\n",
    rule: 'R3',
    lines: [1],
  },
  {
    name: 'R3: core/** importing features/** or shared/ui/**, but not shared/labels',
    file: 'src/app/core/time/violation.ts',
    code: [
      "import { EmptyState } from '../../shared/ui/empty-state/empty-state';",
      "import { TodayPage } from '../../features/today/pages/today-page';",
      "import { RECALL_RATING_LABELS } from '../../shared/labels/recall-rating.labels';",
      'export const all = [EmptyState, TodayPage, RECALL_RATING_LABELS];',
      '',
    ].join('\n'),
    rule: 'R3',
    lines: [1, 2],
  },
  {
    name: 'R3: ui/** importing data/**',
    file: 'src/app/features/today/ui/violation.ts',
    code: "import { todayResource } from '../data/today.resource';\nexport const r = todayResource;\n",
    rule: 'R3',
    lines: [1],
  },
  {
    name: 'R5: enum-to-text translation outside shared/labels/**',
    file: 'src/app/features/today/model/violation.ts',
    code: [
      "import type { GoalStatus } from '../../../core/api/contract/enums';",
      "export const A: Record<GoalStatus, string> = { ACTIVE: 'x', ACHIEVED: 'y', ABANDONED: 'z' };",
      "export const B = { STUDY: 'Estudo' };",
      "export const C = { 'urn:sinapse:problem:conflict': 'Conflito' };",
      '',
    ].join('\n'),
    rule: 'R5',
    lines: [2, 3, 4],
  },
  {
    name: 'R4: date formatting outside core/time/**',
    file: 'src/app/features/today/ui/violation.ts',
    code: [
      "import { DatePipe } from '@angular/common';",
      'export const p = DatePipe;',
      "export const t = (d: Date) => d.toLocaleDateString('pt-BR');",
      'export const h = (d: Date) => d.getHours();',
      '',
    ].join('\n'),
    rule: 'R4',
    lines: [1, 3, 4],
  },
];

for (const { name, file, code, rule, lines } of CASES) {
  test(name, async () => {
    const messages = await boundaryMessages(file, code);
    assert.deepEqual(
      [...new Set(messages.map((m) => m.line))].sort((a, b) => a - b),
      lines,
      `expected violations on lines ${lines}, got ${JSON.stringify(messages)}`,
    );
    for (const message of messages) {
      assert.match(message.text, new RegExp(`\\b${rule}\\b`));
    }
  });
}

test('R2: core/api/api-routes.ts is the one file that may hold /api/', async () => {
  const messages = await boundaryMessages(
    'src/app/core/api/api-routes.ts',
    "export const ME_STATE = '/api/v1/me/state';\n",
  );
  assert.deepEqual(messages, []);
});

test('R4 and R5: core/time and shared/labels keep their own exemptions', async () => {
  assert.deepEqual(
    await boundaryMessages(
      'src/app/core/time/allowed.ts',
      "export const f = new Intl.DateTimeFormat('pt-BR');\n",
    ),
    [],
  );
  assert.deepEqual(
    await boundaryMessages(
      'src/app/shared/labels/allowed.labels.ts',
      "import type { PlanStatus } from '../../core/api/contract/enums';\nexport const L: Record<PlanStatus, string> = { ACTIVE: 'Ativo', SUPERSEDED: 'Substituído' };\n",
    ),
    [],
  );
});

test('src/testing: a spec may import it, production code may not', async () => {
  const spec = await boundaryMessages(
    'src/app/core/api/allowed.spec.ts',
    "import { server } from '../../../testing/msw/server';\nexport const s = server;\n",
  );
  assert.deepEqual(spec, []);

  const production = await boundaryMessages(
    'src/app/core/api/violation.ts',
    "import { server } from '../../../testing/msw/server';\nexport const s = server;\n",
  );
  assert.equal(production.length, 1);
  assert.match(production[0].text, /only a \*\.spec\.ts may import it/);

  const elsewhere = await boundaryMessages(
    'src/app/core/api/violation.spec.ts',
    "import { x } from '../../../environments/x';\nexport const y = x;\n",
  );
  assert.equal(elsewhere.length, 1, 'a spec may leave src/app only for src/testing');
});

test('src/testing keeps R2: no /api/ literal in test infrastructure', async () => {
  const messages = await boundaryMessages(
    'src/testing/msw/violation.ts',
    "export const a = '/api/v1/me/state';\n",
  );
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /\bR2\b/);
});

test('a spec keeps the other boundaries of its directory', async () => {
  const messages = await boundaryMessages(
    'src/app/features/today/pages/violation.spec.ts',
    "import { PLAN_ROUTES } from '../../plan/pages/plan.routes';\nexport const p = PLAN_ROUTES;\n",
  );
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /\bR3\b/);
});
