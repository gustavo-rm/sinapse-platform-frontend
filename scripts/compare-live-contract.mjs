#!/usr/bin/env node
// Compares a live /api-docs with the vendored snapshot. A developer convenience, never the source
// of truth: the vendored src/app/core/api/contract/openapi.json is the contract (ADR 0002).
//
//   node scripts/compare-live-contract.mjs [origin]      default origin: http://localhost:8080
//
// /api-docs exists only when the backend runs under the `local` (or `test`) profile; with no
// profile it answers 404 (backend ADR 0018). The live document can never be byte-identical to the
// snapshot, for reasons the backend documents in docs/openapi/README.md and
// OpenApiSnapshotIntegrationTest:
//
//   1. the snapshot is written in a stable form (keys sorted, two-space indentation, one trailing
//      newline); the live document is compact JSON;
//   2. the snapshot drops `servers` and writes `info.version` as "normalised";
//   3. the snapshot is taken with NO profile, and `local` adds the four /api/v1/probe/** routes,
//      their two schemas and their tag.
//
// So the script reports the raw comparison, then applies exactly those three normalisations and
// compares again, byte for byte. Exit 0 when the normalised live document equals the snapshot.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = resolve(root, 'src/app/core/api/contract/openapi.json');
const PROBE_PATH_PREFIX = '/api/v1/probe/';
const PROBE_SCHEMAS = ['ProbeRequest', 'ProbeResponse'];
const PROBE_TAG = 'Probe';

/** Serialises as Jackson's DefaultPrettyPrinter does in the backend's snapshot test. */
export function stable(value, indent = '') {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[ ]';
    return `[\n${value.map((item) => inner + stable(item, inner)).join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) return '{ }';
    const members = keys.map(
      (key) => `${inner}${JSON.stringify(key)}: ${stable(value[key], inner)}`,
    );
    return `{\n${members.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** The live document with the snapshot's normalisation and without what `local` adds. */
export function normalise(document) {
  const copy = structuredClone(document);
  delete copy.servers;
  copy.info.version = 'normalised';
  for (const path of Object.keys(copy.paths)) {
    if (path.startsWith(PROBE_PATH_PREFIX)) delete copy.paths[path];
  }
  for (const schema of PROBE_SCHEMAS) delete copy.components?.schemas?.[schema];
  if (Array.isArray(copy.tags)) {
    copy.tags = copy.tags.filter((tag) => tag.name !== PROBE_TAG);
  }
  return `${stable(copy)}\n`;
}

function firstDifference(a, b) {
  const lines = [a.split('\n'), b.split('\n')];
  for (let i = 0; i < Math.max(lines[0].length, lines[1].length); i++) {
    if (lines[0][i] !== lines[1][i]) {
      return `line ${i + 1}:\n  live:     ${lines[0][i]}\n  snapshot: ${lines[1][i]}`;
    }
  }
  return 'none';
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const origin = process.argv[2] ?? 'http://localhost:8080';
  const response = await fetch(new URL('/api-docs', origin));
  if (response.status !== 200) {
    console.error(
      `GET ${origin}/api-docs answered ${response.status}. It is served only under the local profile (backend ADR 0018).`,
    );
    process.exit(2);
  }
  const raw = await response.text();
  const snapshot = readFileSync(SNAPSHOT, 'utf8');
  console.log(`raw live document byte-identical to the snapshot: ${raw === snapshot}`);

  const live = JSON.parse(raw);
  const probes = Object.keys(live.paths).filter((path) => path.startsWith(PROBE_PATH_PREFIX));
  console.log(`servers present: ${'servers' in live}; info.version: ${live.info?.version}`);
  console.log(`probe paths added by the local profile: ${probes.length}`);

  const normalised = normalise(live);
  const equal = normalised === snapshot;
  console.log(`normalised live document byte-identical to the snapshot: ${equal}`);
  if (!equal) {
    console.log(`first difference: ${firstDifference(normalised, snapshot)}`);
  }
  process.exit(equal ? 0 : 1);
}
