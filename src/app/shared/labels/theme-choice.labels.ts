import type { ThemeChoice } from '../../core/theme/theme.service';

/**
 * Names of the theme choices. Not a server enum: the client owns the theme. The two theme names
 * are the ones `src/styles/tokens.json` gives its themes.
 */
export const THEME_CHOICE_LABELS: Record<ThemeChoice, string> = {
  system: 'Do sistema',
  light: 'Claro',
  dark: 'Escuro',
};
