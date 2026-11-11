import { Injectable, computed, isDevMode, signal } from '@angular/core';

/**
 * The history reads whose `from`/`to` window the server caps, named by their OpenAPI
 * `operationId` in `sinapse-platform@c3abbff`:
 *
 * | key               | route                                                   |
 * |-------------------|---------------------------------------------------------|
 * | `agenda`          | `GET /api/v1/me/agenda`                                 |
 * | `classroomRoster` | `GET /api/v1/classrooms/{classroomId}/students`         |
 * | `panel`           | `GET /api/v1/classrooms/{classroomId}/students/{accountId}/panel` |
 * | `studySessions`   | `GET /api/v1/study-sessions`                            |
 * | `plannedSessions` | `GET /api/v1/planned-sessions`                          |
 */
export type WindowedRoute =
  'agenda' | 'classroomRoster' | 'panel' | 'studySessions' | 'plannedSessions';

/**
 * Widest window, in days, each route answers. Per route, never one global cap: a single cap is
 * wrong and produces a 400 the client could have prevented.
 *
 * The snapshot states only that each window "is capped"; the numbers are the backend's
 * configuration defaults at `c3abbff` — `sinapse.read-model.max-window: 31d` for the three composed
 * reads, `sinapse.planning.max-schedule-window: 90d` and `sinapse.learning-record.max-history-window:
 * 90d` for the other two. The server compares the instant span, `to - from <= cap`.
 */
export const WINDOW_CAP_DAYS: Readonly<Record<WindowedRoute, number>> = {
  agenda: 31,
  classroomRoster: 31,
  panel: 31,
  studySessions: 90,
  plannedSessions: 90,
};

/** A history window, as the two ISO-8601 instants a windowed route takes. */
export interface TimeWindow {
  readonly from: string;
  readonly to: string;
}

/** The ways an instant is shown. All in Brazilian Portuguese, all in the account's zone. */
export type InstantFormat = 'date' | 'time' | 'dateTime' | 'longDate';

const LOCALE = 'pt-BR';
const FALLBACK_ZONE = 'UTC';
const DAY_MS = 86_400_000;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const FORMAT_OPTIONS: Record<InstantFormat, Intl.DateTimeFormatOptions> = {
  date: { day: '2-digit', month: '2-digit', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  dateTime: {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
  longDate: { day: 'numeric', month: 'long', year: 'numeric' },
};

/**
 * The one place this client turns instants into text, and local dates into instants (`CLAUDE.md`
 * R4). Every conversion uses the ACCOUNT's time zone — `timeZone` of `GET /api/v1/me/state` —
 * never the browser's: the server interprets local times in the account's zone, and formatting in
 * the browser's produces an error that only shows while travelling or at a daylight-saving change.
 *
 * The zone is empty until `SessionStore` fills it from `/me/state`, after every successful
 * bootstrap or refresh, and is emptied again when the session ends. While it is empty — and when
 * the server sent a name this runtime cannot use — every conversion falls back to UTC, and a
 * warning is logged once per cause, in development only. A wrong zone is visible in development
 * and never throws in a template in production.
 */
@Injectable({ providedIn: 'root' })
export class AccountTimeService {
  private readonly accountZone = signal<string | null>(null);
  private readonly formatters = new Map<string, Intl.DateTimeFormat>();
  /** The development warnings already given, so each is logged once and none hides another. */
  private readonly warned = new Set<string>();
  /** True while UTC is in force because the account has no zone by its status. */
  private fallbackExpected = false;

  /** The zone every conversion uses: the account's, or UTC while it is unknown. */
  readonly zone = computed(() => this.accountZone() ?? FALLBACK_ZONE);

  /**
   * Sets the account's IANA zone, as `/me/state` reports it. `null`, or a name the runtime does
   * not know, leaves the UTC fallback in force. The name is validated by constructing a formatter
   * with it inside a try/catch, so an unknown string can never reach `formatInstant` and throw at
   * render time.
   *
   * `absentByStatus`: the zone is null because the account's status carries none (a non-ACTIVE
   * account, whose screens show no date). UTC is then the intended fallback, not a
   * misconfiguration, and no development warning is given for it.
   */
  setAccountZone(timeZone: string | null, absentByStatus = false): void {
    this.fallbackExpected = timeZone === null && absentByStatus;
    if (timeZone !== null && !isKnownZone(timeZone)) {
      this.warn('The account time zone is not a known IANA zone; falling back to UTC.');
      this.accountZone.set(null);
      return;
    }
    this.accountZone.set(timeZone);
  }

  /**
   * Formats an instant in the account's zone — or, before there is an account, in `zone`: the zone
   * the person is declaring on the registration form (FE-6), which will be the account's. A `zone`
   * this runtime does not know is ignored, and the account's zone (or UTC) is used.
   */
  formatInstant(instant: string | Date, format: InstantFormat = 'dateTime', zone?: string): string {
    const date = toDate(instant);
    const use = zone !== undefined && isKnownZone(zone) ? zone : this.effectiveZone();
    return this.formatter(use, FORMAT_OPTIONS[format]).format(date);
  }

  /**
   * The browser's IANA zone, as a SUGGESTION for a person declaring their zone (registration). Never
   * the account's zone: the server does not guess it, and nothing else in this client may read the
   * browser's zone (R4). Null when the runtime does not report one.
   */
  suggestedZone(): string | null {
    try {
      const zone = new Intl.DateTimeFormat(LOCALE).resolvedOptions().timeZone;
      return typeof zone === 'string' && zone !== '' && isKnownZone(zone) ? zone : null;
    } catch {
      return null;
    }
  }

  /**
   * The IANA zones this runtime knows, sorted, for a person to choose from. `include` (the suggestion,
   * or a value already chosen) is added when the runtime's list leaves it out — `UTC` is absent from
   * some engines' lists although every engine accepts it.
   */
  knownZones(include: readonly (string | null)[] = []): readonly string[] {
    const listed = supportedZones();
    const extra = include.filter(
      (zone): zone is string => zone !== null && isKnownZone(zone) && !listed.includes(zone),
    );
    return [...listed, ...extra].sort();
  }

  /**
   * The instant at which a local date and time (`yyyy-MM-dd`, `HH:mm`) happen in the account's
   * zone, as an ISO-8601 string in UTC. On a daylight-saving gap the result is the instant the
   * clock jumped over; on an overlap, one of the two instants that carry that wall time.
   */
  toInstant(localDate: string, localTime = '00:00'): string {
    const [year, month, day] = parseLocalDate(localDate);
    const time = LOCAL_TIME.exec(localTime);
    if (!time) {
      throw new RangeError(`Expected a local time as HH:mm, got "${localTime}".`);
    }
    const wall = Date.UTC(year, month - 1, day, Number(time[1]), Number(time[2]));
    return new Date(this.wallToUtc(wall, this.effectiveZone())).toISOString();
  }

  /** Today's date in the account's zone, as `yyyy-MM-dd`. */
  today(): string {
    return this.localDateAt(Date.now(), this.effectiveZone());
  }

  /** Widest window, in days, a route answers. What a window picker offers and shows. */
  maxWindowDays(route: WindowedRoute): number {
    return WINDOW_CAP_DAYS[route];
  }

  /**
   * The `from`/`to` instants for the local days `fromDate` to `toDate`, both included, in the
   * account's zone: from the start of the first day to the start of the day after the last.
   *
   * Throws a `RangeError` when the days are inverted or more than the route's cap — the request
   * the server would refuse with `time-window-invalid`. A window of exactly the cap that crosses a
   * daylight-saving change lasts an hour more than the cap; its start is moved forward by that
   * hour so the server still accepts it.
   */
  windowOf(route: WindowedRoute, fromDate: string, toDate: string = fromDate): TimeWindow {
    const cap = WINDOW_CAP_DAYS[route];
    const first = Date.UTC(...ymd(parseLocalDate(fromDate)));
    const last = Date.UTC(...ymd(parseLocalDate(toDate)));
    if (last < first) {
      throw new RangeError(`The window for ${route} ends before it starts.`);
    }
    const days = (last - first) / DAY_MS + 1;
    if (days > cap) {
      throw new RangeError(`${route} answers at most ${cap} days; ${days} were asked for.`);
    }

    const zone = this.effectiveZone();
    const to = this.wallToUtc(last + DAY_MS, zone);
    const from = Math.max(this.wallToUtc(first, zone), to - cap * DAY_MS);
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }

  private effectiveZone(): string {
    if (this.accountZone() === null && !this.fallbackExpected) {
      this.warn('The account time zone is not known yet; dates are shown in UTC.');
    }
    return this.zone();
  }

  private warn(message: string): void {
    if (!this.warned.has(message) && isDevMode()) {
      this.warned.add(message);
      console.warn(`[AccountTimeService] ${message}`);
    }
  }

  private formatter(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = `${zone}|${JSON.stringify(options)}`;
    let formatter = this.formatters.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: zone });
      this.formatters.set(key, formatter);
    }
    return formatter;
  }

  /** The wall-clock reading in `zone` at a UTC instant, expressed as if that reading were UTC. */
  private wallAt(utc: number, zone: string): number {
    const parts = this.formatter(zone, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(utc));
    const part = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((candidate) => candidate.type === type)?.value);
    return Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    );
  }

  /** Offset of `zone` from UTC at a UTC instant, in milliseconds. */
  private offsetAt(utc: number, zone: string): number {
    const whole = utc - (((utc % 1000) + 1000) % 1000);
    return this.wallAt(whole, zone) - whole;
  }

  private wallToUtc(wall: number, zone: string): number {
    const firstGuess = this.offsetAt(wall, zone);
    const candidate = wall - firstGuess;
    const corrected = this.offsetAt(candidate, zone);
    return corrected === firstGuess ? candidate : wall - corrected;
  }

  private localDateAt(utc: number, zone: string): string {
    return new Date(this.wallAt(utc, zone)).toISOString().slice(0, 10);
  }
}

function supportedZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  try {
    return typeof intl.supportedValuesOf === 'function'
      ? [...intl.supportedValuesOf('timeZone')]
      : [];
  } catch {
    return [];
  }
}

function isKnownZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function toDate(instant: string | Date): Date {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Expected an ISO-8601 instant.');
  }
  return date;
}

function parseLocalDate(value: string): [number, number, number] {
  const match = LOCAL_DATE.exec(value);
  if (!match) {
    throw new RangeError(`Expected a local date as yyyy-MM-dd, got "${value}".`);
  }
  const parts: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (check.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`"${value}" is not a calendar date.`);
  }
  return parts;
}

function ymd([year, month, day]: [number, number, number]): [number, number, number] {
  return [year, month - 1, day];
}
