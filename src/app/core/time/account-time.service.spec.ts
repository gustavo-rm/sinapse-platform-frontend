import { TestBed } from '@angular/core/testing';

import { AccountTimeService, WINDOW_CAP_DAYS, type WindowedRoute } from './account-time.service';

const DAY_MS = 86_400_000;

/** The zone the test runtime formats in by default; the account zone must differ from it. */
const RUNTIME_ZONE = new Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A zone west of UTC with no daylight saving, that is not the runtime's. */
const WEST = RUNTIME_ZONE === 'America/Sao_Paulo' ? 'America/Bogota' : 'America/Sao_Paulo';
const WEST_OFFSET_HOURS = WEST === 'America/Sao_Paulo' ? -3 : -5;

describe('AccountTimeService', () => {
  let time: AccountTimeService;

  beforeEach(() => {
    time = TestBed.inject(AccountTimeService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('zone', () => {
    it('falls back to UTC while the account zone is unknown, and warns once in development', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(time.zone()).toBe('UTC');
      expect(time.formatInstant('2026-11-06T02:30:00Z', 'time')).toBe('02:30');
      time.formatInstant('2026-11-06T02:30:00Z', 'date');

      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('uses the account zone once it is set', () => {
      time.setAccountZone(WEST);
      expect(time.zone()).toBe(WEST);
    });

    it('keeps the fallback for a name that is not an IANA zone', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      time.setAccountZone('Not/A_Zone');
      expect(time.zone()).toBe('UTC');
    });
  });

  describe('formatInstant', () => {
    it('formats in the account zone, not in the runtime zone', () => {
      expect(WEST).not.toBe(RUNTIME_ZONE);
      time.setAccountZone(WEST);
      const instant = '2026-11-06T02:30:00Z';

      const hour = String(24 + 2 + WEST_OFFSET_HOURS).padStart(2, '0');
      expect(time.formatInstant(instant, 'date')).toBe('05/11/2026');
      expect(time.formatInstant(instant, 'time')).toBe(`${hour}:30`);

      const runtime = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      if (runtime.format(new Date(instant)) === '06/11/2026') {
        expect(time.formatInstant(instant, 'date')).not.toBe(runtime.format(new Date(instant)));
      }
    });

    it('formats east of UTC on the following day', () => {
      time.setAccountZone('Asia/Tokyo');
      expect(time.formatInstant('2026-11-06T20:00:00Z', 'dateTime')).toMatch(
        /^07\/11\/2026,? 05:00$/,
      );
    });

    it('writes the long date in Brazilian Portuguese', () => {
      time.setAccountZone(WEST);
      expect(time.formatInstant('2026-11-04T15:00:00Z', 'longDate')).toBe('4 de novembro de 2026');
    });

    it('refuses a string that is not an instant', () => {
      expect(() => time.formatInstant('amanhã')).toThrow(RangeError);
    });
  });

  describe('toInstant', () => {
    it('reads a local date and time in the account zone', () => {
      time.setAccountZone('America/Sao_Paulo');
      expect(time.toInstant('2026-11-06', '19:00')).toBe('2026-11-06T22:00:00.000Z');
      expect(time.toInstant('2026-11-06')).toBe('2026-11-06T03:00:00.000Z');
    });

    it('follows daylight saving in a zone that has it', () => {
      time.setAccountZone('America/New_York');
      expect(time.toInstant('2026-07-01', '09:00')).toBe('2026-07-01T13:00:00.000Z');
      expect(time.toInstant('2026-12-01', '09:00')).toBe('2026-12-01T14:00:00.000Z');
    });

    it('refuses malformed dates and times', () => {
      expect(() => time.toInstant('06/11/2026')).toThrow(RangeError);
      expect(() => time.toInstant('2026-02-30')).toThrow(RangeError);
      expect(() => time.toInstant('2026-11-06', '24:00')).toThrow(RangeError);
    });
  });

  describe('today', () => {
    it('changes day at local midnight of the account zone, not at UTC midnight', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      time.setAccountZone('America/Sao_Paulo');

      vi.setSystemTime(new Date('2026-11-06T02:59:59Z'));
      expect(time.today()).toBe('2026-11-05');

      vi.setSystemTime(new Date('2026-11-06T03:00:00Z'));
      expect(time.today()).toBe('2026-11-06');
    });

    it('is ahead of UTC east of Greenwich', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      time.setAccountZone('Asia/Tokyo');

      vi.setSystemTime(new Date('2026-11-06T15:00:00Z'));
      expect(time.today()).toBe('2026-11-07');
    });
  });

  describe('windowOf', () => {
    it('knows the cap per route: 31 days on the composed reads, 90 on the others', () => {
      expect(WINDOW_CAP_DAYS).toEqual({
        agenda: 31,
        classroomRoster: 31,
        panel: 31,
        studySessions: 90,
        plannedSessions: 90,
      });
      expect(time.maxWindowDays('agenda')).toBe(31);
      expect(time.maxWindowDays('studySessions')).toBe(90);
    });

    it.each<[WindowedRoute, string, string]>([
      ['agenda', '2026-10-01', '2026-10-31'],
      ['classroomRoster', '2026-10-01', '2026-10-31'],
      ['panel', '2026-10-01', '2026-10-31'],
      ['studySessions', '2026-08-03', '2026-10-31'],
      ['plannedSessions', '2026-08-03', '2026-10-31'],
    ])('accepts exactly the cap on %s', (route, from, to) => {
      time.setAccountZone('UTC');
      const window = time.windowOf(route, from, to);
      expect(Date.parse(window.to) - Date.parse(window.from)).toBe(WINDOW_CAP_DAYS[route] * DAY_MS);
    });

    it.each<[WindowedRoute, string, string]>([
      ['agenda', '2026-10-01', '2026-11-01'],
      ['classroomRoster', '2026-10-01', '2026-11-01'],
      ['panel', '2026-10-01', '2026-11-01'],
      ['studySessions', '2026-08-03', '2026-11-01'],
      ['plannedSessions', '2026-08-03', '2026-11-01'],
    ])('refuses one day over the cap on %s, before the server has to', (route, from, to) => {
      expect(() => time.windowOf(route, from, to)).toThrow(RangeError);
    });

    it('accepts on the 90-day routes a window the 31-day routes refuse', () => {
      expect(() => time.windowOf('agenda', '2026-09-01', '2026-10-31')).toThrow(RangeError);
      expect(() => time.windowOf('studySessions', '2026-09-01', '2026-10-31')).not.toThrow();
    });

    it('runs from the start of the first local day to the start of the day after the last', () => {
      time.setAccountZone('America/Sao_Paulo');
      expect(time.windowOf('agenda', '2026-11-06')).toEqual({
        from: '2026-11-06T03:00:00.000Z',
        to: '2026-11-07T03:00:00.000Z',
      });
    });

    it('refuses an inverted window', () => {
      expect(() => time.windowOf('studySessions', '2026-11-06', '2026-11-05')).toThrow(RangeError);
    });

    it('keeps a window of exactly the cap inside it across a daylight-saving change', () => {
      time.setAccountZone('America/New_York');
      // 31 local days that include 1 November 2026, when New York's clocks go back one hour.
      const window = time.windowOf('agenda', '2026-10-15', '2026-11-14');
      expect(window.to).toBe('2026-11-15T05:00:00.000Z');
      expect(Date.parse(window.to) - Date.parse(window.from)).toBe(31 * DAY_MS);
    });
  });
});
