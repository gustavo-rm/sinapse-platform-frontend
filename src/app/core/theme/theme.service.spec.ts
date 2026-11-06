import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = TestBed.inject(DOCUMENT).documentElement;
    root.removeAttribute('data-theme');
  });

  afterEach(() => root.removeAttribute('data-theme'));

  it('starts on the operating-system preference when <html> carries no data-theme', () => {
    expect(TestBed.inject(ThemeService).choice()).toBe('system');
  });

  it('sets data-theme on <html> for an explicit choice', () => {
    const theme = TestBed.inject(ThemeService);

    theme.choose('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(theme.choice()).toBe('dark');

    theme.choose('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('removes the attribute for the system choice, so prefers-color-scheme applies', () => {
    const theme = TestBed.inject(ThemeService);
    theme.choose('dark');

    theme.choose('system');

    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(theme.choice()).toBe('system');
  });

  it('reads a choice already present on <html>', () => {
    root.setAttribute('data-theme', 'dark');
    expect(TestBed.inject(ThemeService).choice()).toBe('dark');
  });

  it('writes nothing to browser storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    TestBed.inject(ThemeService).choose('dark');

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
