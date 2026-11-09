import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

/**
 * The theme a person chose. `system` means no `data-theme` attribute on `<html>`, so the
 * operating-system preference applies through the `prefers-color-scheme` block of `tokens.css`.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** Every choice, in the order a picker offers them. */
export const THEME_CHOICES = ['system', 'light', 'dark'] as const satisfies readonly ThemeChoice[];

const THEME_ATTRIBUTE = 'data-theme';

/**
 * Applies the theme by setting or removing `data-theme` on `<html>`.
 *
 * The choice lives in memory only. Persisting it across visits is not this service's job yet: it
 * belongs with the session work (FE-4), and this client stores nothing in the browser on its own.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly current = signal<ThemeChoice>(this.readAttribute());

  /** The choice in force. */
  readonly choice = this.current.asReadonly();

  /** Applies a choice: `light` and `dark` set the attribute, `system` removes it. */
  choose(choice: ThemeChoice): void {
    if (choice === 'system') {
      this.root.removeAttribute(THEME_ATTRIBUTE);
    } else {
      this.root.setAttribute(THEME_ATTRIBUTE, choice);
    }
    this.current.set(choice);
  }

  private readAttribute(): ThemeChoice {
    const value = this.root.getAttribute(THEME_ATTRIBUTE);
    return value === 'light' || value === 'dark' ? value : 'system';
  }
}
