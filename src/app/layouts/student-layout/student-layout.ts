import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ThemeService } from '../../core/theme/theme.service';
import { ThemeSwitch } from '../../shared/ui/theme-switch/theme-switch';

/** One entry of the student navigation. */
interface NavItem {
  readonly path: string;
  readonly label: string;
  /** Inline SVG path data on a 24px grid. Not a brand asset: the icon set is decision D-FE3. */
  readonly icon: string;
}

/**
 * Shell of the student area: the four-item navigation and the content region.
 *
 * Below `bp-md` the navigation is a bottom bar; between `bp-md` and `bp-lg` an icon rail of
 * `rail-w`, with the label kept as the accessible name; from `bp-lg` a labelled rail of
 * `sidebar-w`. Order by frequency of use, fixed by `docs/DESIGN_SYSTEM.md` §7.
 */
@Component({
  selector: 'sn-student-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeSwitch],
  templateUrl: './student-layout.html',
  styleUrl: './student-layout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentLayout {
  protected readonly theme = inject(ThemeService);

  protected readonly items: readonly NavItem[] = [
    {
      path: '/hoje',
      label: 'Hoje',
      icon: 'M12 4v2M12 18v2M4 12h2M18 12h2M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
    },
    { path: '/agenda', label: 'Agenda', icon: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4' },
    { path: '/plano', label: 'Plano', icon: 'M7 5v14M7 7h10M7 12h7M7 17h10' },
    {
      path: '/conta',
      label: 'Conta',
      icon: 'M12 5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M5 20c1-3.5 4-5 7-5s6 1.5 7 5',
    },
  ];
}
