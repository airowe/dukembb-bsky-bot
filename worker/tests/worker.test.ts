import { describe, it, expect } from 'vitest';
import {
  inferSeasonStartYear,
  parseSchedule,
  parseTime,
} from '../src/worker';

function partsInTz(ms: number, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

describe('parseTime', () => {
  it('parses standard times', () => {
    expect(parseTime('7 p.m.')).toEqual({ hour: 19, minute: 0 });
    expect(parseTime('7:30 p.m.')).toEqual({ hour: 19, minute: 30 });
    expect(parseTime('12 p.m.')).toEqual({ hour: 12, minute: 0 });
    expect(parseTime('12 a.m.')).toEqual({ hour: 0, minute: 0 });
  });

  it('returns null for TBA', () => {
    expect(parseTime('TBA')).toBeNull();
  });
});

describe('inferSeasonStartYear', () => {
  it('uses header when present', () => {
    const text = "2025-26 Men's Basketball Schedule";
    expect(inferSeasonStartYear(text, Date.UTC(2026, 0, 1))).toBe(2025);
  });
});

describe('parseSchedule', () => {
  it('parses schedule lines and assigns season years', () => {
    const schedule = [
      "2025-26 Men's Basketball Schedule",
      'Nov 10 (Mon) 7 p.m. Home Some Opponent',
      'Jan 05 (Mon) 7:30 p.m. Away Another Opponent',
      'Feb 14 (Sat) TBA Home TBD',
    ].join('\n');

    const games = parseSchedule(schedule, 'America/New_York', Date.UTC(2025, 9, 1));
    expect(games.length).toBe(2);

    const first = partsInTz(games[0], 'America/New_York');
    expect(first).toMatchObject({ year: 2025, month: 11, day: 10, hour: 19, minute: 0 });

    const second = partsInTz(games[1], 'America/New_York');
    expect(second).toMatchObject({ year: 2026, month: 1, day: 5, hour: 19, minute: 30 });
  });
});
