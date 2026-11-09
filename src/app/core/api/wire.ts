/**
 * How values travel to the server: the three time types of the contract.
 *
 * - `Instant` (`format: date-time`): ISO-8601 with an offset. A `Date` becomes its UTC form
 *   (`toISOString`, offset `Z`); a string must already carry an offset and is sent unchanged, so
 *   an instant written as `…-03:00` keeps it.
 * - `LocalDate` (`format: date`): `yyyy-MM-dd`.
 * - `LocalTime` (no format in the snapshot; its examples are `19:00` and `21:00`): `HH:mm`.
 *
 * The local types are never converted: no zone is applied, the browser's or the account's. They
 * are local to the account's zone on the server, and turning a local date into an instant is
 * `AccountTimeService`'s job (`CLAUDE.md` R4). That is why a local date is never a `Date` in
 * this client: a `Date` is an instant, and any value given as a `Date` is sent as one.
 */

/** ISO-8601 instant with an offset: `Z` or `±hh:mm`. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const LOCAL_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** An instant for the wire. A string without an offset is refused: it would be ambiguous. */
export function instant(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new RangeError('Invalid Date cannot be sent as an instant.');
    }
    return value.toISOString();
  }
  if (!INSTANT.test(value)) {
    throw new RangeError(`Expected an ISO-8601 instant with an offset, got "${value}".`);
  }
  return value;
}

/** A local date for the wire, `yyyy-MM-dd`, unchanged. */
export function localDate(value: string): string {
  if (!LOCAL_DATE.test(value)) {
    throw new RangeError(`Expected a local date as yyyy-MM-dd, got "${value}".`);
  }
  return value;
}

/** A local time for the wire, `HH:mm`, unchanged. */
export function localTime(value: string): string {
  if (!LOCAL_TIME.test(value)) {
    throw new RangeError(`Expected a local time as HH:mm, got "${value}".`);
  }
  return value;
}

/** A query parameter value as `ApiClient` accepts it. A `Date` is an instant. */
export type WireParamValue = string | number | boolean | Date;

/** Query parameters as `ApiClient` accepts them. `undefined` and `null` are left out. */
export type WireParams = Readonly<
  Record<string, WireParamValue | readonly WireParamValue[] | null | undefined>
>;

/** The query parameters as strings: each `Date` as an instant, everything else as written. */
export function toWireParams(params: WireParams | undefined): Record<string, string | string[]> {
  const wire: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    wire[name] = Array.isArray(value)
      ? (value as readonly WireParamValue[]).map(toWireValue)
      : toWireValue(value as WireParamValue);
  }
  return wire;
}

function toWireValue(value: WireParamValue): string {
  return value instanceof Date ? instant(value) : String(value);
}

/**
 * A request body for the wire: each `Date`, at any depth, as an instant; everything else as is.
 * (`JSON.stringify` would write a `Date` the same way; this makes the rule explicit and keeps it
 * from depending on `Date.prototype.toJSON`.)
 */
export function toWireBody<T>(body: T): T {
  return convert(body) as T;
}

function convert(value: unknown): unknown {
  if (value instanceof Date) {
    return instant(value);
  }
  if (Array.isArray(value)) {
    return value.map(convert);
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item)]));
  }
  return value;
}
