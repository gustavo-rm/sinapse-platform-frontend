import { getResponse } from 'msw';

import { ApiRoutes } from '../../app/core/api/api-routes';
import { PROBLEM_TYPES } from '../../app/core/api/contract/problem-type';
import { SNAPSHOT, SNAPSHOT_OPERATIONS } from '../contract';
import { violations } from './conformance';
import { type SchemaName, fixture, instanceOf } from './fixtures';
import { handlers } from './handlers';
import { successOf } from './handlers/handlers-from-snapshot';
import { problemBody, statusOf } from './problems';

const SCHEMA_NAMES = Object.keys(SNAPSHOT.components.schemas) as SchemaName[];

describe('MSW fixtures generated from the vendored snapshot', () => {
  it.each(SCHEMA_NAMES.map((name) => [name]))(
    '%s: the generated instance conforms to its schema',
    (name) => {
      expect(violations(fixture(name), SNAPSHOT.components.schemas[name])).toEqual([]);
    },
  );

  it('uses the snapshot examples where it gives them', () => {
    const availability = fixture('AvailabilityRequest');
    expect(availability.startTime).toBe('19:00');
    expect(availability.endTime).toBe('21:00');
    expect(availability.dayOfWeek).toBe('TUESDAY');
    expect(fixture('RegistrationRequest').timeZone).toBe('America/Sao_Paulo');
  });

  it('is deterministic, so a failure reproduces', () => {
    expect(fixture('StudentStateView')).toEqual(fixture('StudentStateView'));
  });

  it('catches a value that breaks its schema (the conformance check is not vacuous)', () => {
    const plan = { ...fixture('GenerationRequestResponse'), status: 'DONE' };
    expect(violations(plan, SNAPSHOT.components.schemas['GenerationRequestResponse'])).toEqual([
      '$.status: not in enum',
    ]);
  });

  it('has one success handler per operation of the snapshot', () => {
    expect(SNAPSHOT_OPERATIONS).toHaveLength(59);
    expect(handlers).toHaveLength(59);
  });

  it.each(
    SNAPSHOT_OPERATIONS.map((entry) => [`${entry.method.toUpperCase()} ${entry.path}`, entry]),
  )('%s answers its declared success status with a conforming body', async (_, entry) => {
    const path = entry.path.replace(/\{[^}]+\}/g, 'p1');
    const request = new Request(new URL(path, location.origin), {
      method: entry.method.toUpperCase(),
    });
    const response = await getResponse([...handlers], request);
    const expected = successOf(entry);
    expect(response?.status).toBe(expected.status);
    const schema = Object.entries(entry.operation.responses).find(
      ([code]) => Number(code) === expected.status,
    )?.[1].content?.['application/json']?.schema;
    if (schema) {
      expect(violations(await response?.json(), schema)).toEqual([]);
    } else {
      expect(await response?.text()).toBe('');
    }
  });

  it.each(PROBLEM_TYPES.map((type) => [type]))(
    '%s: the generated problem body conforms',
    (type) => {
      const body = problemBody(type, ApiRoutes.planning.goals);
      expect(violations(body, SNAPSHOT.components.schemas['ProblemDetails'])).toEqual([]);
      expect(body.status).toBe(statusOf(type));
      expect('errors' in body).toBe(type === 'urn:sinapse:problem:validation-failed');
    },
  );

  it('builds a minimal instance for a schema with no example', () => {
    expect(instanceOf({ type: 'string', minLength: 12, maxLength: 256 })).toHaveLength(12);
    expect(instanceOf({ type: 'integer', minimum: 1, maximum: 5, default: 3 })).toBe(3);
    expect(instanceOf({ type: 'array', minItems: 1, items: { type: 'boolean' } })).toEqual([false]);
  });
});
