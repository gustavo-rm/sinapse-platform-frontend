import { setupStanding } from './setup';

describe('setupStanding: complete is the server’s word', () => {
  it('is complete only when the server says so', () => {
    expect(setupStanding(true, 0, 0)).toBe('complete');
    expect(setupStanding(true, 3, 1)).toBe('complete');
  });

  it('never says complete from what the screen holds, however much it holds', () => {
    expect(setupStanding(false, 20, 20)).toBe('windows-outside-horizon');
    expect(setupStanding(null, 20, 20)).toBe('unknown');
  });

  it('explains a false from what is missing', () => {
    expect(setupStanding(false, 0, 0)).toBe('needs-window-and-goal');
    expect(setupStanding(false, 0, 1)).toBe('needs-window');
    expect(setupStanding(false, 2, 0)).toBe('needs-goal');
  });
});
