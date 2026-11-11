import { ApiProblemFailure, TransportFailure } from '../../../core/api/api-problem';
import { ApiRoutes } from '../../../core/api/api-routes';
import type { ConsentPurpose } from '../../../core/api/contract/enums';
import type { ProblemType } from '../../../core/api/contract/problem-type';
import type { Wording } from '../../../shared/ui/consent-disclosure/wording';
import {
  REGISTRATION_PURPOSES,
  type RegistrationPurpose,
  conflictCauseOf,
  isLocalDate,
  registrationRefusalOf,
} from './registration-outcome';

const ORIGIN = { method: 'POST', route: ApiRoutes.identity.accounts, correlationId: null };

function problem(
  type: ProblemType,
  errors?: { field: string; message: string }[],
  retryAfterSeconds: number | null = null,
) {
  return new ApiProblemFailure(
    { type, title: 't', status: 400, detail: 'd', instance: '/', ...(errors ? { errors } : {}) },
    ORIGIN,
    retryAfterSeconds,
  );
}

function wording(purpose: ConsentPurpose, id: string): Wording {
  return { id, purpose, version: 'v', body: 'b', publishedAt: null };
}

describe('the purposes a registration may carry', () => {
  it('are the essential one and research — never institution sharing (F1, K-I)', () => {
    expect(REGISTRATION_PURPOSES).toEqual(['LEARNING_DATA_PROCESSING', 'ACADEMIC_RESEARCH']);
    expect(REGISTRATION_PURPOSES as readonly string[]).not.toContain('INSTITUTION_SHARING');
  });
});

describe('registrationRefusalOf, by problem type', () => {
  it('reads the fields a 400 names, and never its messages', () => {
    const refusal = registrationRefusalOf(
      problem('urn:sinapse:problem:validation-failed', [
        { field: 'email', message: 'must be a well-formed email address' },
        { field: 'dateOfBirth', message: 'must be a past date' },
        { field: 'timeZone', message: 'must be an IANA time zone identifier' },
      ]),
    );
    expect(refusal).toEqual({
      kind: 'invalid',
      fields: new Set(['email', 'dateOfBirth', 'timeZone']),
      terms: false,
      formLevel: false,
    });
  });

  it.each([
    'acceptedTerms',
    'acceptedTerms[0].termsVersionId',
    'essentialPurposesAccepted',
    'institutionSharingAbsent',
  ])('reads %s as a problem with the accepted terms', (field) => {
    const refusal = registrationRefusalOf(
      problem('urn:sinapse:problem:validation-failed', [{ field, message: 'x' }]),
    );
    expect(refusal).toMatchObject({ kind: 'invalid', terms: true, formLevel: false });
  });

  it('reads an unknown name, or none, as a form-level problem', () => {
    expect(
      registrationRefusalOf(
        problem('urn:sinapse:problem:validation-failed', [{ field: 'request', message: 'x' }]),
      ),
    ).toMatchObject({ kind: 'invalid', formLevel: true });
    expect(registrationRefusalOf(problem('urn:sinapse:problem:validation-failed'))).toMatchObject({
      kind: 'invalid',
      formLevel: true,
    });
  });

  it('reads 422 minor-registration-not-supported as under age', () => {
    expect(
      registrationRefusalOf(problem('urn:sinapse:problem:minor-registration-not-supported')),
    ).toEqual({ kind: 'under-age' });
  });

  it('reads 409 conflict as a conflict to resolve, not an error', () => {
    expect(registrationRefusalOf(problem('urn:sinapse:problem:conflict'))).toEqual({
      kind: 'conflict',
    });
  });

  it('keeps the wait of a 429, and passes anything else on as a failure', () => {
    expect(
      registrationRefusalOf(problem('urn:sinapse:problem:rate-limit-exceeded', undefined, 3600)),
    ).toEqual({ kind: 'rate-limited', retryAfterSeconds: 3600 });
    const network = new TransportFailure('network', ORIGIN);
    expect(registrationRefusalOf(network)).toEqual({ kind: 'failed', failure: network });
  });
});

describe('conflictCauseOf — decision G2', () => {
  const submitted = new Map<RegistrationPurpose, string>([['LEARNING_DATA_PROCESSING', 'ldp-1']]);

  it('is the address when every submitted wording is still in force', () => {
    const current = new Map<ConsentPurpose, Wording>([
      ['LEARNING_DATA_PROCESSING', wording('LEARNING_DATA_PROCESSING', 'ldp-1')],
    ]);
    expect(conflictCauseOf(submitted, current)).toEqual({ kind: 'address-unavailable' });
  });

  it('is the wording when a submitted id is no longer the one in force', () => {
    const current = new Map<ConsentPurpose, Wording>([
      ['LEARNING_DATA_PROCESSING', wording('LEARNING_DATA_PROCESSING', 'ldp-2')],
    ]);
    expect(conflictCauseOf(submitted, current)).toEqual({
      kind: 'wording-changed',
      changed: ['LEARNING_DATA_PROCESSING'],
    });
  });

  it('is the wording when the purpose has no wording in force any more', () => {
    expect(conflictCauseOf(submitted, new Map())).toEqual({
      kind: 'wording-changed',
      changed: ['LEARNING_DATA_PROCESSING'],
    });
  });

  it('ignores a new wording of research when research was declined: nothing stale was sent', () => {
    const current = new Map<ConsentPurpose, Wording>([
      ['LEARNING_DATA_PROCESSING', wording('LEARNING_DATA_PROCESSING', 'ldp-1')],
      ['ACADEMIC_RESEARCH', wording('ACADEMIC_RESEARCH', 'research-2')],
    ]);
    expect(conflictCauseOf(submitted, current)).toEqual({ kind: 'address-unavailable' });
  });

  it('names only the purposes whose wording moved', () => {
    const both = new Map<RegistrationPurpose, string>([
      ['LEARNING_DATA_PROCESSING', 'ldp-1'],
      ['ACADEMIC_RESEARCH', 'research-1'],
    ]);
    const current = new Map<ConsentPurpose, Wording>([
      ['LEARNING_DATA_PROCESSING', wording('LEARNING_DATA_PROCESSING', 'ldp-1')],
      ['ACADEMIC_RESEARCH', wording('ACADEMIC_RESEARCH', 'research-2')],
    ]);
    expect(conflictCauseOf(both, current)).toEqual({
      kind: 'wording-changed',
      changed: ['ACADEMIC_RESEARCH'],
    });
  });
});

describe('isLocalDate — the format of dateOfBirth, as text', () => {
  it.each(['1996-01-01', '2000-02-29', '2024-12-31'])('accepts %s', (value) => {
    expect(isLocalDate(value)).toBe(true);
  });

  it.each(['', '1996-1-1', '01/01/1996', '1900-02-29', '2023-02-29', '2024-13-01', '2024-04-31'])(
    'refuses %j',
    (value) => {
      expect(isLocalDate(value)).toBe(false);
    },
  );
});
