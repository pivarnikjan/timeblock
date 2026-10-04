import { describe, expect, it } from 'vitest';
import { fitSegments } from './blocks';

const seg = (...minutes: number[]) => minutes.map((m) => ({ minutes: m }));

describe('fitSegments', () => {
  it('gives the extra time of a longer block to its last task', () => {
    expect(fitSegments(seg(20, 25), 45, 60)).toEqual([20, 40]);
  });

  it('uses up the rounding slack before taking minutes off', () => {
    // 40 minutes of work in a 45-minute block: 40 still fits.
    expect(fitSegments(seg(20, 20), 45, 40)).toEqual([20, 20]);
    expect(fitSegments(seg(20, 20), 45, 30)).toEqual([20, 10]);
  });

  it('takes minutes off the last task first, then the one before it', () => {
    expect(fitSegments(seg(20, 20, 20), 60, 30)).toEqual([20, 10, 0]);
    expect(fitSegments(seg(30, 30), 60, 15)).toEqual([15, 0]);
  });

  it('leaves a block moved but not resized as it is', () => {
    expect(fitSegments(seg(25, 30), 60, 60)).toEqual([25, 30]);
  });
});
