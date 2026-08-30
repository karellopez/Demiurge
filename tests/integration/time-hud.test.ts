import { beforeEach, describe, expect, it } from 'vitest';

import { FIT_FIRST_YEAR, FIT_LAST_YEAR } from '@domain/orbits/validity';
import { fromCalendarDate } from '@domain/time/julian';
import { INITIAL_TIME_SCALE, faster, reversed } from '@domain/time-scale';
import { mountTimeHud, type TimeHud } from '@presentation/ui/time-hud';
import { seconds, type Seconds } from '@shared/units';

let host: HTMLElement;
let hud: TimeHud;
let currentMs: number;

/**
 * Midday UTC on the first of January of a year.
 *
 * @param year - The calendar year.
 * @returns Seconds since J2000.0.
 */
function atNewYear(year: number): Seconds {
  return fromCalendarDate({ year, month: 1, day: 1, hour: 12, minute: 0, second: 0 });
}

/**
 * Publishes one frame's stats, letting the throttle through.
 *
 * @param simTimeSeconds - The simulated time to show.
 */
function publish(simTimeSeconds: Seconds): void {
  currentMs += 1000;
  hud.publish({
    simTimeSeconds,
    frameTimeMs: 16.7,
    steps: 2,
    droppedSeconds: seconds(0),
    drawCalls: 0,
    triangles: 0,
  });
}

/**
 * Reads the date cell.
 *
 * @returns The element showing the simulated date.
 */
function dateCell(): HTMLElement {
  return host.querySelector<HTMLElement>('.time-hud__date')!;
}

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  currentMs = 0;
  hud = mountTimeHud(host, 'quiet-amber-lattice', () => currentMs);
});

describe('the seed', () => {
  it('stays on screen, because a universe you cannot name you cannot share', () => {
    expect(host.querySelector('.time-hud__seed')?.textContent).toBe('quiet-amber-lattice');
  });
});

describe('the simulated date', () => {
  it('reads as a UTC timestamp', () => {
    publish(seconds(0));
    expect(dateCell().textContent).toBe('2000-01-01 12:00:00 UTC');
  });

  it('is unmarked inside the window the element fit covers', () => {
    publish(atNewYear(2020));
    expect(dateCell().classList.contains('time-hud__date--unfitted')).toBe(false);
    expect(dateCell().title).toBe('');
  });

  it('is marked once the date runs past the end of the fit', () => {
    publish(atNewYear(FIT_LAST_YEAR + 1));
    expect(dateCell().classList.contains('time-hud__date--unfitted')).toBe(true);
    expect(dateCell().title).toContain(String(FIT_FIRST_YEAR));
    expect(dateCell().title).toContain(String(FIT_LAST_YEAR));
  });

  it('is marked running backwards past the start of it too', () => {
    publish(atNewYear(FIT_FIRST_YEAR - 1));
    expect(dateCell().classList.contains('time-hud__date--unfitted')).toBe(true);
  });

  it('clears the mark on returning to the window', () => {
    publish(atNewYear(3000));
    publish(atNewYear(2000));
    expect(dateCell().classList.contains('time-hud__date--unfitted')).toBe(false);
    expect(dateCell().title).toBe('');
  });
});

describe('the rate', () => {
  it('marks paused with more than colour', () => {
    hud.setTimeScale({ index: 0, direction: 'forward' });
    const rate = host.querySelector<HTMLElement>('.time-hud__rate')!;
    expect(rate.textContent).toBe('paused');
    expect(rate.classList.contains('time-hud__rate--paused')).toBe(true);
  });

  it('marks reversed with more than colour', () => {
    hud.setTimeScale(reversed(faster(INITIAL_TIME_SCALE)));
    const rate = host.querySelector<HTMLElement>('.time-hud__rate')!;
    expect(rate.textContent.startsWith('-')).toBe(true);
    expect(rate.classList.contains('time-hud__rate--reverse')).toBe(true);
  });
});
