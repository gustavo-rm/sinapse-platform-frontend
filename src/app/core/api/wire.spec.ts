import { instant, localDate, localTime, toWireBody, toWireParams } from './wire';

describe('wire serialisation', () => {
  it('sends a Date as an ISO-8601 instant in UTC, whatever the runtime zone', () => {
    const at = new Date(Date.UTC(2026, 10, 9, 15, 30, 0));
    expect(instant(at)).toBe('2026-11-09T15:30:00.000Z');
    expect(toWireParams({ from: at })).toEqual({ from: '2026-11-09T15:30:00.000Z' });
  });

  it('keeps the offset of an instant given as a string', () => {
    expect(instant('2026-11-09T12:30:00-03:00')).toBe('2026-11-09T12:30:00-03:00');
    expect(instant('2026-11-09T12:30:00+09:00')).toBe('2026-11-09T12:30:00+09:00');
    expect(toWireParams({ to: instant('2026-11-09T23:59:59.999-03:00') })).toEqual({
      to: '2026-11-09T23:59:59.999-03:00',
    });
  });

  it('refuses an instant without an offset, which would be ambiguous', () => {
    expect(() => instant('2026-11-09T12:30:00')).toThrowError(RangeError);
  });

  it('sends a local date and a local time as written, with no zone applied', () => {
    expect(localDate('2026-02-28')).toBe('2026-02-28');
    expect(localDate('2026-12-31')).toBe('2026-12-31');
    expect(localTime('00:00')).toBe('00:00');
    expect(localTime('23:30')).toBe('23:30');
    expect(toWireParams({ on: localDate('2026-01-01') })).toEqual({ on: '2026-01-01' });
    expect(
      toWireBody({
        startTime: localTime('19:00'),
        endTime: localTime('21:00'),
        effectiveFrom: '2026-03-01',
      }),
    ).toEqual({ startTime: '19:00', endTime: '21:00', effectiveFrom: '2026-03-01' });
  });

  it('refuses a local date or time in another shape', () => {
    expect(() => localDate('09/11/2026')).toThrowError(RangeError);
    expect(() => localDate('2026-13-01')).toThrowError(RangeError);
    expect(() => localTime('19:00:00')).toThrowError(RangeError);
    expect(() => localTime('24:00')).toThrowError(RangeError);
  });

  it('converts every Date of a body, at any depth, and leaves the rest alone', () => {
    const at = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(toWireBody({ a: at, b: [at, 'x'], c: { d: at, e: 1 }, f: null })).toEqual({
      a: '2026-01-02T03:04:05.000Z',
      b: ['2026-01-02T03:04:05.000Z', 'x'],
      c: { d: '2026-01-02T03:04:05.000Z', e: 1 },
      f: null,
    });
  });

  it('leaves out null and undefined parameters and repeats array ones', () => {
    expect(toWireParams({ a: undefined, b: null, c: ['x', 'y'], d: 3, e: false })).toEqual({
      c: ['x', 'y'],
      d: '3',
      e: 'false',
    });
  });
});
