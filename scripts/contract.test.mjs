// Keeps the vendored contract honest. Run with `npm run test:scripts` (part of `npm test`).
//
//   - openapi.json hashes to the SHA-256 recorded in provenance.json: a hand edit of the vendored copy
//     would otherwise be invisible. Line endings are normalised to LF first (K-J): a CRLF checkout
//     of the same contract passes, and the recorded hash is the LF one
//   - schema.d.ts is exactly a regeneration of openapi.json: a hand edit of the generated file, or
//     a snapshot refreshed without `npm run contract`, fails here
//   - schema.d.ts declares types and nothing else: compiled, it emits no JavaScript (ADR 0002)

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import ts from 'typescript';

import {
  CONTRACT_DIR,
  PROVENANCE,
  SCHEMA_DTS,
  SNAPSHOT,
  normaliseLineEndings,
  regenerate,
} from './generate-contract.mjs';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The provenance record of the vendored snapshot. A JSON file, not a markdown table: a drift guard
 * must not depend on how a formatter lays out a table (Prettier reformatting the table once broke
 * the parser that read it).
 */
function provenance() {
  return JSON.parse(readFileSync(PROVENANCE, 'utf8'));
}

/** The JavaScript a TypeScript source compiles to, comments and blank lines removed. */
function emittedJavaScript(source) {
  const { outputText } = ts.transpileModule(source, {
    fileName: 'schema.ts',
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: true,
      verbatimModuleSyntax: false,
    },
  });
  return outputText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== 'export {};')
    .join('\n');
}

/** Top-level statements that are not type-only declarations. */
function runtimeStatements(source) {
  const file = ts.createSourceFile('schema.d.ts', source, ts.ScriptTarget.ES2022, false);
  return file.statements
    .filter(
      (statement) => !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement),
    )
    .map((statement) => ts.SyntaxKind[statement.kind]);
}

test('provenance.json names the source repository, the source commit, the SHA-256 and the date', () => {
  const record = provenance();
  assert.match(record.sourceRepository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(record.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(record.sha256, /^[0-9a-f]{64}$/);
  assert.match(record.vendoredOn, /^\d{4}-\d{2}-\d{2}$/);
});

/** The drift guard's hash: of the snapshot with its line endings normalised to LF. */
function contractHash(bytes) {
  return sha256(normaliseLineEndings(bytes));
}

test('the vendored openapi.json hashes to the SHA-256 recorded in provenance.json', () => {
  assert.equal(contractHash(readFileSync(SNAPSHOT)), provenance().sha256);
});

test('a one-byte edit of the vendored snapshot changes the hash', () => {
  const bytes = readFileSync(SNAPSHOT);
  const edited = Buffer.from(bytes);
  edited[edited.length - 2] ^= 1;
  assert.notEqual(contractHash(edited), provenance().sha256);
});

test('a CRLF copy of the same snapshot passes: the hash is of the LF form (K-J)', () => {
  const lf = normaliseLineEndings(readFileSync(SNAPSHOT));
  const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
  // The numbers measured on a Windows checkout of the backend at 46b5b3c.
  assert.equal(crlf.length, 131_588);
  assert.equal(sha256(crlf).slice(0, 8), 'c8da37dd');
  assert.notEqual(sha256(crlf), provenance().sha256, 'the raw CRLF bytes do hash differently');
  assert.equal(contractHash(crlf), provenance().sha256);
});

test('the recorded SHA-256 is of the LF form, and the LF form is what is committed', () => {
  const lf = normaliseLineEndings(readFileSync(SNAPSHOT));
  assert.equal(lf.length, 127_161);
  assert.equal(sha256(lf), provenance().sha256);
  assert.ok(!lf.includes(0x0d), 'no carriage return survives normalisation');
});

test('normalising line endings does not hide a change of content', () => {
  const crlf = Buffer.from(
    normaliseLineEndings(readFileSync(SNAPSHOT)).toString('utf8').replace(/\n/g, '\r\n'),
    'utf8',
  );
  const edited = Buffer.from(crlf);
  edited[edited.length - 4] ^= 1;
  assert.notEqual(contractHash(edited), provenance().sha256);
});

test('the vendored snapshot has the operation and schema counts provenance.json records', () => {
  const spec = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const paths = Object.keys(spec.paths).length;
  const operations = Object.values(spec.paths).reduce(
    (count, item) => count + HTTP_METHODS.filter((method) => item[method]).length,
    0,
  );
  const schemas = Object.keys(spec.components.schemas).length;
  assert.deepEqual(provenance().counted, { openapi: spec.openapi, paths, operations, schemas });
});

test('the committed schema.d.ts is exactly a regeneration of the vendored snapshot', () => {
  assert.equal(readFileSync(SCHEMA_DTS, 'utf8'), regenerate());
});

test('schema.d.ts declares only interfaces and type aliases', () => {
  assert.deepEqual(runtimeStatements(readFileSync(SCHEMA_DTS, 'utf8')), []);
});

test('schema.d.ts, compiled as a module, emits no JavaScript', () => {
  assert.equal(emittedJavaScript(readFileSync(SCHEMA_DTS, 'utf8')), '');
});

test('the two checks reject a declaration file that carries a runtime value', () => {
  const withRuntime = 'export type A = "x";\nexport enum Status { A = "A" }\nexport const b = 1;\n';
  // SyntaxKind has aliases (VariableStatement is also FirstStatement): count, do not name.
  assert.equal(runtimeStatements(withRuntime).length, 2);
  assert.notEqual(emittedJavaScript(withRuntime), '');
});

test('models.ts aliases every schema of the snapshot, under its own name, and nothing else', () => {
  const spec = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const models = readFileSync(resolve(CONTRACT_DIR, 'models.ts'), 'utf8');
  const aliases = [...models.matchAll(/^export type (\w+) = Schemas\['(\w+)'\];$/gm)];
  for (const [line, alias, schema] of aliases) {
    assert.equal(alias, schema, `the alias must carry the schema's name: ${line}`);
  }
  const exported = [...models.matchAll(/^export /gm)].length;
  assert.equal(exported, aliases.length, 'models.ts exports only schema aliases');
  assert.deepEqual(
    aliases.map(([, alias]) => alias).sort(),
    Object.keys(spec.components.schemas).sort(),
  );
});

test('the live-comparison normaliser writes the snapshot exactly as the backend does', async () => {
  const { normalise } = await import('./compare-live-contract.mjs');
  const snapshot = readFileSync(SNAPSHOT, 'utf8');
  const live = JSON.parse(snapshot);
  live.servers = [{ url: 'http://localhost:8080' }];
  live.info.version = '0.1.0-SNAPSHOT';
  live.paths['/api/v1/probe/ping'] = { get: {} };
  assert.equal(normalise(live), snapshot);
});
