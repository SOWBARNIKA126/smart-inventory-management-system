import {describe, expect, it} from 'vitest';
import {growthDirection, indiaDateKey, previousIndiaMonthStart, revenuePresentation} from '../src/lib/chart-presentation';

describe('Revenue chart presentation', () => {
  it('keeps today separate from the completed trend and retains genuine zero days', () => {
    const rows = [{date:'2026-09-09', revenue:200}, {date:'2026-09-10', revenue:0}, {date:'2026-09-11', revenue:15}];
    const result = revenuePresentation(rows, 'daily', new Date('2026-09-11T03:00:00Z'));
    expect(result.completed).toEqual(rows.slice(0,2));
    expect(result.current).toEqual(rows[2]);
    expect(rows).toHaveLength(3);
  });
  it('changes periods at Indian midnight, not UTC midnight', () => {
    const rows = [{date:'2026-09-10', revenue:100}, {date:'2026-09-11', revenue:5}];
    expect(revenuePresentation(rows, 'daily', new Date('2026-09-10T18:29:59Z')).current).toEqual(rows[0]);
    expect(revenuePresentation(rows, 'daily', new Date('2026-09-10T18:30:00Z')).current).toEqual(rows[1]);
    expect(indiaDateKey(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
  it('does not compare a partial month as a completed month', () => {
    const rows = [{date:'2026-08-01', revenue:2000}, {date:'2026-09-01', revenue:15}];
    expect(revenuePresentation(rows, 'monthly', new Date('2026-09-11T03:00:00Z'))).toEqual({completed:[rows[0]], current:rows[1]});
  });
  it('handles empty, only-current and historical-only data', () => {
    const now = new Date('2026-09-11T03:00:00Z');
    expect(revenuePresentation([], 'daily', now)).toEqual({completed:[], current:undefined});
    expect(revenuePresentation([{date:'2026-09-11', revenue:0}], 'daily', now).completed).toEqual([]);
    expect(revenuePresentation([{date:'2026-09-10', revenue:25}], 'daily', now).current).toBeUndefined();
  });
});

describe('Indian reporting month boundaries', () => {
  it.each([
    ['2026-03-11T09:00:00Z','2026-01-31T18:30:00.000Z'],
    ['2026-01-11T09:00:00Z','2025-11-30T18:30:00.000Z'],
    ['2024-03-11T09:00:00Z','2024-01-31T18:30:00.000Z'],
    ['2026-08-31T18:30:00Z','2026-07-31T18:30:00.000Z'],
  ])('uses the first local day of the previous month for %s', (now, expected) => {
    expect(previousIndiaMonthStart(new Date(now)).toISOString()).toBe(expected);
  });
});

describe('Trend directions', () => {
  it.each([[12.3,'increase'],[-12.3,'decrease'],[0,'unchanged'],[-0.01,'unchanged'],[null,'unavailable'],[undefined,'unavailable'],[NaN,'unavailable'],[Infinity,'unavailable']] as const)('formats %s as %s', (value, expected) => {
    expect(growthDirection(value)).toBe(expected);
  });
});
