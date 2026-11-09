import {
  ACCOUNT_STATUSES,
  CLASSROOM_STATUSES,
  CONSENT_GRANTED_BY,
  CONSENT_PURPOSES,
  DAYS_OF_WEEK,
  DURATION_SOURCES,
  ENROLLMENT_END_REASONS,
  ERASURE_REQUEST_STATUSES,
  GENERATION_REQUEST_STATUSES,
  GOAL_STATUSES,
  PLANNED_SESSION_KINDS,
  PLAN_GENERATION_FAILURES,
  PLAN_STATUSES,
  RECALL_RATINGS,
  SESSION_KINDS,
  SESSION_SOURCES,
  SESSION_STATUSES,
} from '../../core/api/contract/enums';
import { PROBLEM_TYPES } from '../../core/api/contract/problem-type';
import { THEME_CHOICES } from '../../core/theme/theme.service';
import { ACCOUNT_STATUS_LABELS } from './account-status.labels';
import { CLASSROOM_STATUS_LABELS } from './classroom-status.labels';
import { CONSENT_GRANTED_BY_LABELS } from './consent-granted-by.labels';
import { CONSENT_PURPOSE_LABELS } from './consent-purpose.labels';
import { DAY_OF_WEEK_LABELS } from './day-of-week.labels';
import { DURATION_SOURCE_LABELS } from './duration-source.labels';
import { ENROLLMENT_END_REASON_LABELS } from './enrollment-end-reason.labels';
import { ERASURE_REQUEST_STATUS_LABELS } from './erasure-request-status.labels';
import { GENERATION_REQUEST_STATUS_LABELS } from './generation-request-status.labels';
import { GOAL_STATUS_LABELS } from './goal-status.labels';
import { PLAN_GENERATION_FAILURE_LABELS } from './plan-generation-failure.labels';
import { PLAN_STATUS_LABELS } from './plan-status.labels';
import { PLANNED_SESSION_KIND_LABELS } from './planned-session-kind.labels';
import { PROBLEM_TYPE_LABELS } from './problem-type.labels';
import { RECALL_RATING_LABELS } from './recall-rating.labels';
import { SESSION_KIND_LABELS } from './session-kind.labels';
import { SESSION_SOURCE_LABELS } from './session-source.labels';
import { SESSION_STATUS_LABELS } from './session-status.labels';
import { THEME_CHOICE_LABELS } from './theme-choice.labels';

/** Each catalogue next to the values it must cover. */
const CATALOGUES: [string, readonly string[], Record<string, string>][] = [
  ['AccountStatus', ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS],
  ['ConsentPurpose', CONSENT_PURPOSES, CONSENT_PURPOSE_LABELS],
  ['ConsentGrantedBy', CONSENT_GRANTED_BY, CONSENT_GRANTED_BY_LABELS],
  ['GoalStatus', GOAL_STATUSES, GOAL_STATUS_LABELS],
  ['PlanStatus', PLAN_STATUSES, PLAN_STATUS_LABELS],
  ['PlannedSessionKind', PLANNED_SESSION_KINDS, PLANNED_SESSION_KIND_LABELS],
  ['GenerationRequestStatus', GENERATION_REQUEST_STATUSES, GENERATION_REQUEST_STATUS_LABELS],
  ['PlanGenerationFailure', PLAN_GENERATION_FAILURES, PLAN_GENERATION_FAILURE_LABELS],
  ['SessionKind', SESSION_KINDS, SESSION_KIND_LABELS],
  ['SessionSource', SESSION_SOURCES, SESSION_SOURCE_LABELS],
  ['SessionStatus', SESSION_STATUSES, SESSION_STATUS_LABELS],
  ['DurationSource', DURATION_SOURCES, DURATION_SOURCE_LABELS],
  ['RecallRating', RECALL_RATINGS, RECALL_RATING_LABELS],
  ['ClassroomStatus', CLASSROOM_STATUSES, CLASSROOM_STATUS_LABELS],
  ['EnrollmentEndReason', ENROLLMENT_END_REASONS, ENROLLMENT_END_REASON_LABELS],
  ['ErasureRequestStatus', ERASURE_REQUEST_STATUSES, ERASURE_REQUEST_STATUS_LABELS],
  ['DayOfWeek', DAYS_OF_WEEK, DAY_OF_WEEK_LABELS],
  ['ProblemType', PROBLEM_TYPES, PROBLEM_TYPE_LABELS],
  ['ThemeChoice', THEME_CHOICES, THEME_CHOICE_LABELS],
];

/** Words that judge the student, or celebrate. `docs/DESIGN_SYSTEM.md` §2.4: describe, never evaluate. */
const JUDGEMENT =
  /(?<!\p{L})(ruim|insuficiente|parab[eé]ns|[oó]tim[oa]|excelente|frac[oa]|p[eé]ssim[oa]|baix[oa]|bom|boa|mal|incr[ií]vel|perfeit[oa])(?!\p{L})/iu;

describe('label catalogue', () => {
  it('covers the 16 domain enums, DayOfWeek, the problem types and the theme choice', () => {
    expect(CATALOGUES).toHaveLength(19);
  });

  it('knows exactly the 17 problem types of the backend catalogue', () => {
    expect(PROBLEM_TYPES).toHaveLength(17);
    expect(new Set(PROBLEM_TYPES).size).toBe(17);
    for (const type of PROBLEM_TYPES) {
      expect(type).toMatch(/^urn:sinapse:problem:[a-z]+(-[a-z]+)*$/);
    }
  });

  describe.each(CATALOGUES)('%s', (_name, values, labels) => {
    it('has a label for every value, and for nothing else', () => {
      expect(Object.keys(labels).sort()).toEqual([...values].sort());
    });

    it('never renders a value raw, an empty label or a duplicate within the enum', () => {
      const texts = Object.values(labels);
      for (const [value, text] of Object.entries(labels)) {
        expect(text.trim()).not.toBe('');
        expect(text).not.toBe(value);
        expect(text).not.toMatch(/[A-Z]{2,}_|urn:/);
      }
      expect(new Set(texts).size).toBe(texts.length);
    });

    it('carries no judgement word and no exclamation mark', () => {
      for (const text of Object.values(labels)) {
        expect(text).not.toMatch(JUDGEMENT);
        expect(text).not.toContain('!');
      }
    });
  });

  it('keeps the four RecallRating labels exactly as the design system gives them (D-FE2)', () => {
    expect(RECALL_RATINGS.map((rating) => RECALL_RATING_LABELS[rating])).toEqual([
      'Não lembrei',
      'Lembrei com dificuldade',
      'Lembrei',
      'Lembrei com facilidade',
    ]);
  });
});
