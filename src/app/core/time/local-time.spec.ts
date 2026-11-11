import { isAfterLocalTime, isLocalTime, localTimeFromWire, localTimeToWire } from './local-time';

// F19: the server echoes `HH:mm:ss` while the contract and the design system say `HH:mm`.
describe('local time on the wire (F19)', () => {
  describe('in: what the server sends', () => {
    it('reads the echo observed on 46b5b3c, HH:mm:ss, as HH:mm', () => {
      expect(localTimeFromWire('19:00:00')).toBe('19:00');
      expect(localTimeFromWire('08:30:00')).toBe('08:30');
    });

    it('reads the form of the contract examples, HH:mm, unchanged', () => {
      expect(localTimeFromWire('19:00')).toBe('19:00');
      expect(localTimeFromWire('23:59')).toBe('23:59');
    });

    it('reads fractional seconds, which a LocalTime may carry, as HH:mm', () => {
      expect(localTimeFromWire('07:15:00.000')).toBe('07:15');
    });

    it('refuses anything that is not a time of day', () => {
      for (const value of ['24:00', '7:00', '19h00', '19:60', '', '19:00Z', '19:00:00-03:00']) {
        expect(() => localTimeFromWire(value)).toThrow(RangeError);
      }
    });
  });

  describe('out: what this client sends', () => {
    it('always sends HH:mm', () => {
      expect(localTimeToWire('19:00')).toBe('19:00');
      expect(localTimeToWire('19:00:00')).toBe('19:00');
      expect(localTimeToWire(' 06:05 ')).toBe('06:05');
    });

    it('refuses what a form could hold that is not a time', () => {
      expect(() => localTimeToWire('')).toThrow(RangeError);
      expect(isLocalTime('')).toBe(false);
      expect(isLocalTime('21:00:00')).toBe(true);
    });
  });

  describe('order, as the server judges it', () => {
    it('requires the end strictly after the start, in either form', () => {
      expect(isAfterLocalTime('21:00', '19:00')).toBe(true);
      expect(isAfterLocalTime('21:00:00', '19:00')).toBe(true);
      expect(isAfterLocalTime('19:00', '19:00:00')).toBe(false);
      expect(isAfterLocalTime('19:00', '21:00')).toBe(false);
    });

    it('does not cross midnight: 23:00 to 00:00 closes before it opens', () => {
      expect(isAfterLocalTime('00:00', '23:00')).toBe(false);
    });
  });
});
