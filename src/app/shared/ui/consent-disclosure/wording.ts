import type { ConsentPurpose } from '../../../core/api/contract/enums';
import type { TermsVersionSummary } from '../../../core/api/contract/models';

/*
 * The published wordings of the consent terms, as every screen that shows one reads them. Moved here
 * from `features/privacy/model/consent.ts` in FE-6: registration (`features/auth`) shows the same
 * texts with the same component, and a feature never imports another (R3).
 */

/** A published wording, with the three members this client cannot do without. */
export interface Wording {
  readonly id: string;
  readonly purpose: ConsentPurpose;
  readonly version: string;
  readonly body: string;
  /** Absent in no observed body, but optional in the schema (K-A): then no date is shown. */
  readonly publishedAt: string | null;
}

/**
 * The wording in force for each purpose: the most recently published one, which is the one the
 * server will accept (`TermsService.currentFor`: the first by `publishedAt` descending). An entry
 * without an `id`, a `purpose`, a `version` or a `body` is skipped: it cannot be shown in full or
 * accepted, and consent to a text that was not shown is not consent.
 */
export function currentWordings(
  terms: readonly TermsVersionSummary[],
): ReadonlyMap<ConsentPurpose, Wording> {
  const current = new Map<ConsentPurpose, Wording>();
  for (const entry of terms) {
    const { id, purpose, version, body } = entry;
    if (!id || !purpose || !version || body === undefined || body.trim() === '') {
      continue;
    }
    const wording: Wording = { id, purpose, version, body, publishedAt: entry.publishedAt ?? null };
    const held = current.get(purpose);
    if (held === undefined || isLater(wording.publishedAt, held.publishedAt)) {
      current.set(purpose, wording);
    }
  }
  return current;
}

function isLater(candidate: string | null, held: string | null): boolean {
  if (candidate === null) {
    return false;
  }
  return held === null || Date.parse(candidate) > Date.parse(held);
}

/** The marker the backend's `local` profile puts on its three wordings (`application-local.yml`). */
const PLACEHOLDER_VERSION = 'dev-0';
const PLACEHOLDER_BODY = 'Development placeholder';

/**
 * Whether a wording is one of the development placeholders, which are not consent terms (F5). Any
 * screen that shows one says so visibly, so nobody in development mistakes it for a real term.
 */
export function isDevelopmentPlaceholder(wording: Wording): boolean {
  return wording.version === PLACEHOLDER_VERSION || wording.body.includes(PLACEHOLDER_BODY);
}
