// @ts-check
// The architecture boundaries of CLAUDE.md §6, as ESLint rules that fail the build (rule R7).
//
//   R1  HttpClient is imported only under core/api/**
//   R2  the literal /api/ appears only in core/api/api-routes.ts; no absolute URL anywhere
//   R3  features/* never import another feature; shared/** never imports features/**;
//       core/** never imports features/** or shared/ui/**; ui/** never imports data/**
//   R4  no date is formatted outside core/time/** (AccountTimeService)
//   R5  enum-to-text translation lives only in shared/labels/**
//
// Relative imports stay inside src/app, with one opening: a *.spec.ts may import src/testing (MSW
// handlers and fixtures generated from the contract, FE-3), and production code may not.
//
// `no-restricted-imports` matches the import string as written, not the file it resolves to. So
// that a relative path cannot slip past a boundary, the configuration is generated per directory
// of src/app: in each one, the depth is known, and every `../` chain that would land in a
// forbidden folder becomes an exact pattern. One block per directory also keeps ESLint's flat
// config from replacing one rule's options with another's when two blocks match the same file.
//
// A directory created after ESLint loaded this file is covered by the fallback block (R1, R2, R4,
// R5) until the next run; the CLI and CI always load it afresh.

const fs = require('node:fs');
const path = require('node:path');

const APP_DIR = 'src/app';

/** Files exempt from a rule, by path under src/app. */
const EXEMPT_FILES = {
  'core/api/api-routes.ts': ['R2'],
};

// --- R1 ---------------------------------------------------------------------------------------

const R1 = 'R1 (CLAUDE.md §6) — only core/api/** may make an HTTP call. Use the API layer.';

// --- R2 ---------------------------------------------------------------------------------------

const R2_API =
  'R2 (CLAUDE.md §6) — only core/api/api-routes.ts holds the literal /api/. Take the route from there.';
const R2_ABSOLUTE = 'R2 (CLAUDE.md §6) — no absolute URL: same origin is an architectural premise.';
// A module path is not a URL: the source of an import or export is left out. esquery cannot read
// "/" inside a regex, so a slash is written as its Unicode escape, u002F after a backslash.
const NOT_MODULE_SOURCE =
  ':not(ImportDeclaration):not(ExportNamedDeclaration):not(ExportAllDeclaration):not(ImportExpression) > ';
const R2_SYNTAX = [
  { selector: `${NOT_MODULE_SOURCE}Literal[value=/\\u002Fapi\\u002F/]`, message: R2_API },
  { selector: 'TemplateElement[value.raw=/\\u002Fapi\\u002F/]', message: R2_API },
  {
    selector: `${NOT_MODULE_SOURCE}Literal[value=/^(https?:)?\\u002F\\u002F/i]`,
    message: R2_ABSOLUTE,
  },
  { selector: 'TemplateElement[value.raw=/^(https?:)?\\u002F\\u002F/i]', message: R2_ABSOLUTE },
];

// --- R4 ---------------------------------------------------------------------------------------

const R4 =
  'R4 (CLAUDE.md §6) — no date is formatted, or read in the browser zone, outside AccountTimeService. Use it, or the accountDate pipe.';
const R4_SYNTAX = [
  { selector: "MemberExpression[object.name='Intl'][property.name='DateTimeFormat']", message: R4 },
  {
    selector:
      'CallExpression[callee.property.name=/^(toLocaleDateString|toLocaleTimeString|toLocaleString|toDateString|toTimeString|getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getTimezoneOffset)$/]',
    message: `${R4} (For a number, use Intl.NumberFormat.)`,
  },
];
const R4_PATHS = [
  {
    name: '@angular/common',
    importNames: ['DatePipe', 'formatDate', 'CommonModule'],
    message: `${R4} CommonModule is refused because it carries the date pipe; import what you need by name.`,
  },
];

// --- R5 ---------------------------------------------------------------------------------------

const R5 =
  'R5 (CLAUDE.md §6) — translating an enum value to text happens only in shared/labels/**, typed as Record<Enum, string>.';
const R5_SYNTAX = [
  {
    selector:
      "TSTypeReference[typeName.name='Record'][typeArguments.params.0.type='TSTypeReference'][typeArguments.params.1.type='TSStringKeyword']",
    message: R5,
  },
  {
    selector:
      "Property[key.type='Identifier'][key.name=/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/][value.type='Literal'][value.value=/^[A-ZÀ-Þ]/]",
    message: R5,
  },
  {
    selector:
      "Property[key.type='Literal'][key.value=/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/][value.type='Literal'][value.value=/^[A-ZÀ-Þ]/]",
    message: R5,
  },
  { selector: 'Property[key.value=/^urn:sinapse:problem:/]', message: R5 },
];

// --- R3 ---------------------------------------------------------------------------------------

const R3_FEATURES =
  'R3 (CLAUDE.md §6) — a feature never imports another feature. What is shared rises to shared/.';
const R3_SHARED = 'R3 (CLAUDE.md §6) — shared/** never imports from features/**.';
const R3_CORE = 'R3 (CLAUDE.md §6) — core/** never imports from features/** or shared/ui/**.';
const R3_UI =
  'R3 (CLAUDE.md §6) — ui/** never imports from data/**. A component receives data; it does not fetch it.';
const OUTSIDE_APP = 'Relative imports stay inside src/app.';
const OUTSIDE_APP_SPEC =
  'Relative imports stay inside src/app; a spec may also reach src/testing, and nothing else.';
const TESTING_ONLY =
  'src/testing is test infrastructure (MSW, generated fixtures): only a *.spec.ts may import it.';

/** @param {string} text */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Exact patterns for every relative import string, written from `dirSegs`, that lands in
 * `target`. A target segment is a folder name, or `{ not: name }` for any folder but that one.
 *
 * @param {string[]} dirSegs directory of the importing file, as segments under src/app
 * @param {(string | { not: string })[]} target forbidden folder, as segments under src/app
 * @returns {string[]}
 */
function landingPatterns(dirSegs, target) {
  const patterns = [];
  for (let climb = 0; climb <= dirSegs.length; climb++) {
    const landing = dirSegs.slice(0, dirSegs.length - climb);
    if (landing.length >= target.length) continue;
    const compatible = landing.every((seg, i) => {
      const t = target[i];
      return typeof t === 'string' ? t === seg : seg !== t.not;
    });
    if (!compatible) continue;
    const rest = target
      .slice(landing.length)
      .map((t) =>
        typeof t === 'string'
          ? escapeRegex(t)
          : `(?!${escapeRegex(t.not)}(?:/|$)|\\.{1,2}(?:/|$))[^/]+`,
      )
      .join('/');
    const prefix = climb === 0 ? '\\./' : `(?:\\.\\./){${climb}}`;
    patterns.push(`^${prefix}${rest}(?:/|$)`);
  }
  return patterns;
}

/**
 * Every restriction that applies to files directly inside `dir` (relative to src/app).
 *
 * @param {string} dir
 * @param {string[]} exemptions rule ids lifted for this file
 * @param {{ spec?: boolean }} [kind] whether the files are specs, which may import src/testing
 */
function restrictionsFor(dir, exemptions = [], kind = {}) {
  const segs = dir === '' ? [] : dir.split('/');
  const under = (/** @type {string} */ prefix) => dir === prefix || dir.startsWith(`${prefix}/`);

  /** @type {{ regex: string, message: string }[]} */
  const patterns = [];
  const forbid = (
    /** @type {(string | { not: string })[]} */ target,
    /** @type {string} */ message,
  ) => {
    for (const regex of landingPatterns(segs, target)) patterns.push({ regex, message });
  };

  // R3
  if (segs[0] === 'features' && segs.length >= 2)
    forbid(['features', { not: segs[1] }], R3_FEATURES);
  if (segs[0] === 'shared') forbid(['features'], R3_SHARED);
  if (segs[0] === 'core') {
    forbid(['features'], R3_CORE);
    forbid(['shared', 'ui'], R3_CORE);
  }
  if (segs.includes('ui')) patterns.push({ regex: '(?:^|/)data(?:/|$)', message: R3_UI });
  // Leaving src/app is refused, except for src/testing, which only a spec may reach.
  patterns.push({
    regex: `^(?:\\.\\./){${segs.length + 1}}(?!testing(?:/|$))`,
    message: kind.spec ? OUTSIDE_APP_SPEC : OUTSIDE_APP,
  });
  if (!kind.spec) {
    patterns.push({
      regex: `^(?:\\.\\./){${segs.length + 1}}testing(?:/|$)`,
      message: TESTING_ONLY,
    });
  }

  const paths = [];
  const syntax = [];
  const globals = [];

  // R1
  if (!under('core/api')) {
    paths.push({ name: '@angular/common/http', importNames: ['HttpClient'], message: R1 });
    globals.push({ name: 'fetch', message: R1 }, { name: 'XMLHttpRequest', message: R1 });
  }
  // R2
  if (!exemptions.includes('R2')) syntax.push(...R2_SYNTAX);
  // R4
  if (!under('core/time')) {
    syntax.push(...R4_SYNTAX);
    paths.push(...R4_PATHS);
  }
  // R5
  if (!under('shared/labels')) syntax.push(...R5_SYNTAX);

  return {
    'no-restricted-imports': ['error', { paths, patterns }],
    'no-restricted-syntax': ['error', ...syntax],
    'no-restricted-globals': ['error', ...globals],
  };
}

/** @param {string} root absolute path of src/app */
function directories(root) {
  /** @type {string[]} */
  const found = [''];
  const walk = (/** @type {string} */ rel) => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      found.push(child);
      walk(child);
    }
  };
  walk('');
  return found;
}

/**
 * Flat-config blocks enforcing the boundaries, one per directory of src/app plus one per exempt
 * file, after a fallback for anything not listed.
 *
 * @param {string} projectRoot
 */
function boundaryConfigs(projectRoot) {
  const root = path.join(projectRoot, APP_DIR);
  const blocks = [
    {
      name: 'sinapse/boundaries/fallback',
      files: ['src/**/*.ts'],
      rules: restrictionsFor('(unlisted)'),
    },
  ];
  // src/testing (MSW handlers, generated fixtures) lives outside src/app and may import from it.
  // R1, R2, R4 and R5 still hold there; only the "stay inside src/app" pattern does not apply.
  const testing = restrictionsFor('(unlisted)');
  blocks.push({
    name: 'sinapse/boundaries/testing',
    files: ['src/testing/**/*.ts'],
    rules: {
      ...testing,
      'no-restricted-imports': [
        'error',
        { paths: testing['no-restricted-imports'][1].paths, patterns: [] },
      ],
    },
  });
  for (const dir of directories(root)) {
    const base = `${APP_DIR}/${dir === '' ? '' : `${dir}/`}`;
    const exempt = Object.keys(EXEMPT_FILES).filter(
      (file) => path.posix.dirname(file) === (dir || '.'),
    );
    blocks.push({
      name: `sinapse/boundaries/${dir || '(root)'}`,
      files: [`${base}*.ts`],
      ignores: [`${base}*.spec.ts`, ...exempt.map((file) => `${APP_DIR}/${file}`)],
      rules: restrictionsFor(dir),
    });
    blocks.push({
      name: `sinapse/boundaries/${dir || '(root)'} (specs)`,
      files: [`${base}*.spec.ts`],
      rules: restrictionsFor(dir, [], { spec: true }),
    });
    for (const file of exempt) {
      blocks.push({
        name: `sinapse/boundaries/${file}`,
        files: [`${APP_DIR}/${file}`],
        rules: restrictionsFor(dir, EXEMPT_FILES[/** @type {keyof typeof EXEMPT_FILES} */ (file)]),
      });
    }
  }
  return blocks;
}

module.exports = { boundaryConfigs, restrictionsFor, landingPatterns };
