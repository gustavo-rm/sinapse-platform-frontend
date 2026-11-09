import type { RecallRating } from '../../core/api/contract/enums';

/**
 * The four `RecallRating` levels. A MEASUREMENT INSTRUMENT, not interface copy: the text of each
 * level determines the data the pilot collects, and rewording one invalidates comparison across
 * pilot periods.
 *
 * Exactly as `docs/DESIGN_SYSTEM.md` §14 gives them. They await the owner's approval (D-FE2 in
 * `docs/ai/STATE.md`). Do not reword them here; a change is the owner's decision, recorded first.
 */
export const RECALL_RATING_LABELS: Record<RecallRating, string> = {
  AGAIN: 'Não lembrei',
  HARD: 'Lembrei com dificuldade',
  GOOD: 'Lembrei',
  EASY: 'Lembrei com facilidade',
};
