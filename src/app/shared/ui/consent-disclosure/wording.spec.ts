import type { TermsVersionSummary } from '../../../core/api/contract/models';
import { currentWordings, isDevelopmentPlaceholder } from './wording';

describe('currentWordings', () => {
  it('keeps, per purpose, the most recently published wording — the one the server accepts', () => {
    const terms: TermsVersionSummary[] = [
      {
        id: 'old',
        purpose: 'ACADEMIC_RESEARCH',
        version: '1',
        body: 'a',
        publishedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'new',
        purpose: 'ACADEMIC_RESEARCH',
        version: '2',
        body: 'b',
        publishedAt: '2026-06-01T00:00:00Z',
      },
      {
        id: 'ldp',
        purpose: 'LEARNING_DATA_PROCESSING',
        version: '1',
        body: 'c',
        publishedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const current = currentWordings(terms);
    expect(current.get('ACADEMIC_RESEARCH')?.id).toBe('new');
    expect(current.get('LEARNING_DATA_PROCESSING')?.id).toBe('ldp');
    expect(current.has('INSTITUTION_SHARING')).toBe(false);
  });

  it('does not depend on the order of the list', () => {
    const terms: TermsVersionSummary[] = [
      {
        id: 'new',
        purpose: 'ACADEMIC_RESEARCH',
        version: '2',
        body: 'b',
        publishedAt: '2026-06-01T00:00:00Z',
      },
      {
        id: 'old',
        purpose: 'ACADEMIC_RESEARCH',
        version: '1',
        body: 'a',
        publishedAt: '2026-01-01T00:00:00Z',
      },
    ];
    expect(currentWordings(terms).get('ACADEMIC_RESEARCH')?.id).toBe('new');
  });

  it('skips a wording that cannot be shown in full or accepted', () => {
    const terms: TermsVersionSummary[] = [
      { purpose: 'ACADEMIC_RESEARCH', version: '1', body: 'no id' },
      { id: 'x', purpose: 'ACADEMIC_RESEARCH', version: '1', body: '   ' },
      { id: 'y', purpose: 'ACADEMIC_RESEARCH', body: 'no version' },
    ];
    expect(currentWordings(terms).size).toBe(0);
  });
});

describe('isDevelopmentPlaceholder', () => {
  it('recognises the dev-0 wordings of the local profile (F5)', () => {
    expect(
      isDevelopmentPlaceholder({
        id: 'a',
        purpose: 'ACADEMIC_RESEARCH',
        version: 'dev-0',
        body: 'Development placeholder. Not a consent term.',
        publishedAt: null,
      }),
    ).toBe(true);
  });

  it('does not mark a real wording', () => {
    expect(
      isDevelopmentPlaceholder({
        id: 'a',
        purpose: 'ACADEMIC_RESEARCH',
        version: '2026.1',
        body: 'Texto real.',
        publishedAt: null,
      }),
    ).toBe(false);
  });
});
