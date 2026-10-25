// When the timeline is collapsed, the parts of the file that are not covered by any segment are hidden,
// and the remaining parts are laid out back to back, so that they fill the whole timeline.
// "file time" is a time in the file, "timeline time" is the position on the collapsed timeline (in seconds from its start).

export interface TimeRange {
  start: number,
  end: number,
}

export interface TimelineMapping {
  // the ranges of the file that are shown on the timeline, sorted and non-overlapping
  ranges: TimeRange[],
  // total duration of the timeline
  duration: number,
  // times in hidden parts are mapped to the point where they were collapsed
  fileToTimeline: (fileTime: number) => number,
  timelineToFile: (timelineTime: number) => number,
  isVisible: (fileTime: number) => boolean,
  collapsed: boolean,
}

export function getVisibleRanges(segments: { start: number, end?: number | undefined }[], fileDuration: number) {
  const sorted = segments
    .flatMap(({ start, end }) => (end != null ? [{ start: Math.max(0, start), end: Math.min(fileDuration, end) }] : []))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last != null && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function createTimelineMapping({ ranges, fileDuration }: { ranges: TimeRange[] | undefined, fileDuration: number }): TimelineMapping {
  const duration = ranges?.reduce((acc, { start, end }) => acc + (end - start), 0) ?? 0;

  if (ranges == null || ranges.length === 0 || duration <= 0) {
    return {
      ranges: [{ start: 0, end: fileDuration }],
      duration: fileDuration,
      fileToTimeline: (fileTime) => fileTime,
      timelineToFile: (timelineTime) => timelineTime,
      isVisible: () => true,
      collapsed: false,
    };
  }

  const first = ranges[0]!;
  const last = ranges.at(-1)!;

  return {
    ranges,
    duration,
    fileToTimeline: (fileTime) => {
      if (fileTime <= first.start) return 0;
      if (fileTime >= last.end) return duration;
      let acc = 0;
      for (const { start, end } of ranges) {
        if (fileTime < end) return acc + Math.max(0, fileTime - start);
        acc += end - start;
      }
      return duration;
    },
    timelineToFile: (timelineTime) => {
      if (timelineTime <= 0) return first.start;
      let acc = 0;
      for (const { start, end } of ranges) {
        const length = end - start;
        if (timelineTime < acc + length) return start + (timelineTime - acc);
        acc += length;
      }
      return last.end;
    },
    isVisible: (fileTime) => ranges.some(({ start, end }) => fileTime >= start && fileTime <= end),
    collapsed: true,
  };
}
