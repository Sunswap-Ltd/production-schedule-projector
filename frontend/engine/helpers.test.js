import {describe, it, expect} from 'vitest';
import {lerp, addDays, parseDate, isoDay, deliveryWeekMonday, mondayOfWeek, fmtNum} from './helpers';

describe('lerp', () => {
  it('interpolates linearly inside [0,1]', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(200, 100, 0.25)).toBe(175);
  });
  it('clamps t outside [0,1]', () => {
    expect(lerp(2, 8, -1)).toBe(2);
    expect(lerp(2, 8, 5)).toBe(8);
  });
});

describe('date helpers', () => {
  it('addDays crosses month boundaries', () => {
    const d = addDays(new Date(2026, 0, 30), 5); // 30 Jan + 5 = 4 Feb
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(4);
  });
  it('parseDate round-trips with isoDay', () => {
    expect(isoDay(parseDate('2026-06-15'))).toBe('2026-06-15');
  });
  it('mondayOfWeek and deliveryWeekMonday land on a Monday', () => {
    expect(mondayOfWeek(new Date(2026, 5, 17)).getDay()).toBe(1); // Wed → Mon
    expect(deliveryWeekMonday(new Date(2026, 5, 20)).getDay()).toBe(1); // Sat → next Mon
  });
});

describe('fmtNum', () => {
  it('renders an em dash for null', () => {
    expect(fmtNum(null)).toBe('—');
  });
  it('respects decimal places', () => {
    expect(fmtNum(3.14159, 2)).toBe('3.14');
  });
});
