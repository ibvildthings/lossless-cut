import { describe, expect, test } from 'vitest';

import { createTimelineMapping, getVisibleRanges } from './timelineCollapse';


describe('getVisibleRanges', () => {
  test('merges overlapping and adjacent segments, ignores markers, clamps to file', () => {
    expect(getVisibleRanges([
      { start: 50, end: 60 },
      { start: 0, end: 10 },
      { start: 5, end: 20 },
      { start: 20, end: 25 },
      { start: 30 },
      { start: 90, end: 120 },
    ], 100)).toEqual([
      { start: 0, end: 25 },
      { start: 50, end: 60 },
      { start: 90, end: 100 },
    ]);
  });

  test('no segments', () => {
    expect(getVisibleRanges([{ start: 3 }], 100)).toEqual([]);
  });
});

describe('createTimelineMapping', () => {
  test('not collapsed without ranges', () => {
    const mapping = createTimelineMapping({ ranges: [], fileDuration: 100 });
    expect(mapping.collapsed).toBe(false);
    expect(mapping.duration).toBe(100);
    expect(mapping.fileToTimeline(42)).toBe(42);
    expect(mapping.timelineToFile(42)).toBe(42);
  });

  const mapping = createTimelineMapping({ ranges: [{ start: 10, end: 20 }, { start: 50, end: 60 }], fileDuration: 100 });

  test('duration is the sum of the ranges', () => {
    expect(mapping.collapsed).toBe(true);
    expect(mapping.duration).toBe(20);
  });

  test('file to timeline', () => {
    expect(mapping.fileToTimeline(0)).toBe(0);
    expect(mapping.fileToTimeline(10)).toBe(0);
    expect(mapping.fileToTimeline(15)).toBe(5);
    expect(mapping.fileToTimeline(20)).toBe(10);
    expect(mapping.fileToTimeline(30)).toBe(10); // hidden
    expect(mapping.fileToTimeline(55)).toBe(15);
    expect(mapping.fileToTimeline(60)).toBe(20);
    expect(mapping.fileToTimeline(100)).toBe(20);
  });

  test('timeline to file', () => {
    expect(mapping.timelineToFile(-1)).toBe(10);
    expect(mapping.timelineToFile(0)).toBe(10);
    expect(mapping.timelineToFile(5)).toBe(15);
    expect(mapping.timelineToFile(10)).toBe(50);
    expect(mapping.timelineToFile(15)).toBe(55);
    expect(mapping.timelineToFile(20)).toBe(60);
    expect(mapping.timelineToFile(30)).toBe(60);
  });

  test('isVisible', () => {
    expect(mapping.isVisible(5)).toBe(false);
    expect(mapping.isVisible(15)).toBe(true);
    expect(mapping.isVisible(30)).toBe(false);
  });
});
