// Keeps the vendored contract honest. Run with `npm run test:scripts` (part of `npm test`).
//
//   - openapi.json hashes to the SHA-256 recorded in its README: a hand edit of the vendored copy
//     would otherwise be invisible
//   - schema.d.ts is exactly a regeneration of openapi.json: a hand edit of the generated file, or
//     a snapshot refreshed without `npm run contract`, fails here
//   - schema.d.ts declares types and nothing else: compiled, it emits no JavaScript (ADR 0002)

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import ts from 'typescript';

import { PROVENANCE, SCHEMA_DTS, SNAPSHOT, regenerate } from './generate-contract.mjs';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The value of a `| Field | Value |` row of the provenance table, without backticks. */
function provenance(field) {
  const row = readFileSync(PROVENANCE, 'utf8')
    .split('\n')
    .find((line) => line.startsWith(`| ${field} |`));
  assert.ok(row, `README.md has no "${field}" row`);
  return row.split('|')[2].trim().replace(/`/g, '');
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
      (statement) =>
        !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement),
    )
    .map((statement) => ts.SyntaxKind[statement.kind]);
}

test('the vendored openapi.json hashes to the SHA-256 recorded in its README', () => {
  assert.equal(sha256(readFileSync(SNAPSHOT)), provenance('SHA-256'));
});

test('a one-byte edit of the vendored snapshot changes the hash', () => {
  const bytes = readFileSync(SNAPSHOT);
  const edited = Buffer.from(bytes);
  edited[edited.length - 2] ^= 1;
  assert.notEqual(sha256(edited), provenance('SHA-256'));
});

test('the vendored snapshot has the operation and schema counts its README records', () => {
  const spec = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const paths = Object.keys(spec.paths).length;
  const operations = Object.values(spec.paths).reduce(
    (count, item) => count + HTTP_METHODS.filter((method) => item[method]).length,
    0,
  );
  const schemas = Object.keys(spec.components.schemas).length;
  assert.equal(
    provenance('Counted'),
    `OpenAPI ${spec.openapi}, ${paths} paths, ${operations} operations, ${schemas} schemas`,
  );
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
