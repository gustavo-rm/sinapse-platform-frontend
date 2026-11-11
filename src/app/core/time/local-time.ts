/**
 * A local time of day — `startTime`/`endTime` of an availability window — as it travels, in both
 * directions. The ONE place where the two forms are reconciled (F19 in `docs/ai/STATE.md`):
 *
 * - **in**: the contract's examples say `HH:mm` (`"19:00"`), and the server echoes `HH:mm:ss`
 *   (`"19:00:00"`, observed on `46b5b3c` for every window). Both are accepted and read as `HH:mm`.
 *   Seconds are dropped: every window this client declares has none, and the screen reads minutes;
 * - **out**: always `HH:mm`, as the snapshot's examples and `docs/DESIGN_SYSTEM.md` §11 say. An
 *   `<input type="time">` may give `HH:mm:ss` when its step is under a minute; that is accepted and
 *   cut to `HH:mm` here too.
 *
 * No zone is applied in either direction: these are local times in the account's zone, and the
 * server interprets them there.
 */

const WIRE_TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,9})?)?$/;

/** A local time read from the server, as `HH:mm`. Throws a `RangeError` on anything else. */
export function localTimeFromWire(value: string): string {
  const match = WIRE_TIME.exec(value);
  if (!match) {
    throw new RangeError(`Expected a local time as HH:mm or HH:mm:ss, got "${value}".`);
  }
  return `${match[1]}:${match[2]}`;
}

/** A local time for the server, `HH:mm`, from what a form holds. Throws a `RangeError` otherwise. */
export function localTimeToWire(value: string): string {
  return localTimeFromWire(value.trim());
}

/** Whether `value` is a local time this client can read (`HH:mm` or `HH:mm:ss`). */
export function isLocalTime(value: string): boolean {
  return WIRE_TIME.test(value.trim());
}

/**
 * Whether the time `end` comes strictly after `start`, both read as above. The server's own rule
 * (`AvailabilityRequest.isTimeRangeOrdered`, `endTime.isAfter(startTime)`): equal is refused, and a
 * window cannot cross midnight — `23:00`–`00:00` is a window that closes before it opens.
 */
export function isAfterLocalTime(end: string, start: string): boolean {
  return localTimeFromWire(end) > localTimeFromWire(start);
}
